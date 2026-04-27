import type { Finding, PullRequestContext, ReviewOptions, ReviewResult } from '@hallux/shared';
import { isAtLeastSeverity } from '@hallux/shared';
import { AnthropicClient } from './anthropic.js';
import { runAgent } from './agent.js';
import { aggregate } from './aggregator.js';

export type { PullRequestContext, ReviewOptions, ReviewResult, Finding } from '@hallux/shared';
export { AnthropicClient } from './anthropic.js';
export { formatFindingsMarkdown } from './aggregator.js';

/**
 * The rule-pack registry. Rule packs register themselves here at startup.
 * Populated by packages/rule-packs when it calls registerRulePack().
 */
import type { RulePack } from '@hallux/shared';

const rulePackRegistry = new Map<string, RulePack>();

/**
 * Registers a rule pack so it is available for review runs.
 * Called by packages/rule-packs at module load time.
 */
export function registerRulePack(pack: RulePack): void {
  rulePackRegistry.set(pack.name, pack);
}

/**
 * Returns all currently registered rule packs.
 */
export function getRegisteredRulePacks(): RulePack[] {
  return Array.from(rulePackRegistry.values());
}

/**
 * Reviews a pull request using all enabled rule packs.
 *
 * For each enabled rule pack, spawns an agent with a scoped system prompt and toolset.
 * Agents run sequentially to avoid overwhelming the Anthropic API with concurrent requests.
 * Findings are deduplicated and aggregated into a final review comment.
 *
 * Logs to stdout: total tokens, tool calls, time elapsed, findings per rule pack.
 *
 * @param context - PR metadata, diff, and changed files.
 * @param options - Optional configuration (enabled packs, min severity, API key).
 */
export async function reviewPullRequest(
  context: PullRequestContext,
  options: ReviewOptions = {},
): Promise<ReviewResult & { markdown: string }> {
  const start = Date.now();
  const client = new AnthropicClient(options.anthropicApiKey);

  const allPacks = getRegisteredRulePacks();
  const enabledNames = options.enabledRulePacks;
  const packs = enabledNames
    ? allPacks.filter((p) => enabledNames.includes(p.name))
    : allPacks;

  if (packs.length === 0) {
    console.warn('[hallux] No rule packs registered or enabled. Did you import @hallux/rule-packs?');
  }

  const allFindings: Finding[] = [];
  let totalToolCalls = 0;

  for (const pack of packs) {
    console.log(`[hallux] Running rule pack: ${pack.name}`);
    const packStart = Date.now();

    const result = await runAgent(context, pack, client);

    allFindings.push(...result.findings);
    totalToolCalls += result.toolCalls;

    console.log(
      `[hallux] ${pack.name}: ${result.findings.length} finding(s) · ${result.toolCalls} tool calls · ${result.durationMs}ms`,
    );
  }

  const minSeverity = options.minSeverity ?? 'medium';
  const filteredFindings = allFindings.filter((f) =>
    isAtLeastSeverity(f.severity, minSeverity),
  );

  const stats = client.getStats();
  const durationMs = Date.now() - start;

  const { findings: dedupedFindings, markdown } = await aggregate(
    filteredFindings,
    {
      tokensUsed: stats.inputTokens + stats.outputTokens,
      durationMs,
      toolCalls: totalToolCalls,
    },
    client,
  );

  const finalStats = client.getStats();

  console.log(
    `[hallux] Review complete: ${dedupedFindings.length} finding(s) · ${finalStats.inputTokens + finalStats.outputTokens} tokens · ${totalToolCalls} tool calls · ${durationMs}ms`,
  );

  return {
    findings: dedupedFindings,
    markdown,
    stats: {
      tokensUsed: finalStats.inputTokens + finalStats.outputTokens,
      toolCalls: totalToolCalls,
      durationMs,
    },
  };
}
