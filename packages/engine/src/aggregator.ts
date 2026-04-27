import type { Finding, Severity } from '@hallux/shared';
import { SEVERITY_ORDER } from '@hallux/shared';
import { AnthropicClient } from './anthropic.js';
import { aggregatorPrompt } from './prompts/index.js';

const AGGREGATOR_MODEL = 'claude-sonnet-4-6';

export interface AggregationResult {
  findings: Finding[];
  markdown: string;
}

/**
 * Deduplicates findings and generates the final PR review comment markdown.
 *
 * Deduplication strategy: findings with the same (file, line, rulePack) triple are merged,
 * keeping the highest-severity version.
 *
 * @param allFindings - Combined findings from all rule pack agents.
 * @param stats - Runtime stats to embed in the review comment.
 * @param client - AnthropicClient instance for LLM-based comment generation.
 */
export async function aggregate(
  allFindings: Finding[],
  stats: { tokensUsed: number; durationMs: number; toolCalls: number },
  client: AnthropicClient,
): Promise<AggregationResult> {
  const deduped = deduplicateFindings(allFindings);
  const ranked = rankBySeverity(deduped);

  const markdown = await generateReviewComment(ranked, stats, client);

  return { findings: ranked, markdown };
}

/**
 * Removes duplicate findings — same file + line + rulePack — keeping the most severe.
 */
function deduplicateFindings(findings: Finding[]): Finding[] {
  const key = (f: Finding) => `${f.file}:${f.line}:${f.rulePack}`;
  const map = new Map<string, Finding>();

  for (const finding of findings) {
    const k = key(finding);
    const existing = map.get(k);
    if (!existing || isMoreSevere(finding.severity, existing.severity)) {
      map.set(k, finding);
    }
  }

  return Array.from(map.values());
}

function isMoreSevere(a: Severity, b: Severity): boolean {
  return SEVERITY_ORDER.indexOf(a) < SEVERITY_ORDER.indexOf(b);
}

function rankBySeverity(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
}

/**
 * Uses Claude to generate the final Markdown PR comment from structured findings.
 */
async function generateReviewComment(
  findings: Finding[],
  stats: { tokensUsed: number; durationMs: number; toolCalls: number },
  client: AnthropicClient,
): Promise<string> {
  if (findings.length === 0) {
    return formatEmptyResult(stats);
  }

  const prompt = `Here are the findings from the hallux analysis:

${JSON.stringify(findings, null, 2)}

Stats:
- Total tokens used: ${stats.tokensUsed}
- Total tool calls: ${stats.toolCalls}
- Duration: ${stats.durationMs}ms

Generate the PR review comment following the format in your instructions. Replace {N}, {tokensUsed}, and {durationMs} with the actual values.`;

  const response = await client.createMessage({
    model: AGGREGATOR_MODEL,
    max_tokens: 2048,
    system: aggregatorPrompt,
    messages: [{ role: 'user', content: prompt }],
  });

  for (const block of response.content) {
    if (block.type === 'text') {
      return block.text.trim();
    }
  }

  // Fallback: generate markdown directly without LLM.
  return formatFindingsMarkdown(findings, stats);
}

function formatEmptyResult(stats: {
  tokensUsed: number;
  durationMs: number;
}): string {
  return `## Hallux Analysis

No issues found in this PR.

*Reviewed by [hallux](https://github.com/hallux/hallux) v0.1 · ${stats.tokensUsed} tokens · ${stats.durationMs}ms*`;
}

/**
 * Deterministic Markdown formatter — used as fallback when LLM generation fails.
 */
export function formatFindingsMarkdown(
  findings: Finding[],
  stats: { tokensUsed: number; durationMs: number; toolCalls: number },
): string {
  const sections: string[] = [`## Hallux Analysis\n\nFound ${findings.length} issue(s) in this PR.\n`];

  const bySeverity = new Map<Severity, Finding[]>();
  for (const f of findings) {
    const arr = bySeverity.get(f.severity) ?? [];
    arr.push(f);
    bySeverity.set(f.severity, arr);
  }

  for (const severity of SEVERITY_ORDER) {
    const group = bySeverity.get(severity);
    if (!group || group.length === 0) continue;

    const heading = severity.charAt(0).toUpperCase() + severity.slice(1);
    sections.push(`### ${heading}\n`);

    for (const f of group) {
      sections.push(`**\`${f.file}:${f.line}\`** — ${f.message}\n`);
      if (f.suggestion) {
        sections.push(`> ${f.suggestion}\n`);
      }
    }
  }

  // Summary table.
  const rulePackCounts = new Map<string, number>();
  for (const f of findings) {
    rulePackCounts.set(f.rulePack, (rulePackCounts.get(f.rulePack) ?? 0) + 1);
  }

  sections.push('### Summary\n\n| Rule Pack | Findings |\n|---|---|');
  for (const [pack, count] of rulePackCounts) {
    sections.push(`| ${pack} | ${count} |`);
  }

  sections.push(
    `\n*Reviewed by [hallux](https://github.com/hallux/hallux) v0.1 · ${stats.tokensUsed} tokens · ${stats.toolCalls} tool calls · ${stats.durationMs}ms*`,
  );

  return sections.join('\n');
}
