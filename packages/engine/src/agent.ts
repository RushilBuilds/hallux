import type { Finding, PullRequestContext, RulePack } from '@hallux/shared';
import type Anthropic from '@anthropic-ai/sdk';
import { AnthropicClient } from './anthropic.js';
import {
  ALL_TOOL_DEFINITIONS,
  ReportFindingsInputSchema,
  executeTool,
  reportFindingsTool,
} from './tools/index.js';

const AGENT_MODEL = 'claude-sonnet-4-6';
const MAX_TOOL_CALLS = 10;

export interface AgentResult {
  findings: Finding[];
  tokensUsed: number;
  toolCalls: number;
  durationMs: number;
}

/**
 * Runs a single rule-pack agent against a pull request.
 *
 * The agent loop:
 * 1. Sends the PR diff + context as the first user message
 * 2. Allows the agent up to MAX_TOOL_CALLS to gather information
 * 3. Forces conclusion when MAX_TOOL_CALLS is reached or report_findings is called
 * 4. Returns findings extracted from the report_findings tool call
 *
 * @param context - Full PR context including diff and changed files.
 * @param rulePack - The rule pack defining the system prompt and allowed tools.
 * @param client - Shared AnthropicClient instance for token tracking.
 */
export async function runAgent(
  context: PullRequestContext,
  rulePack: RulePack,
  client: AnthropicClient,
): Promise<AgentResult> {
  const start = Date.now();

  const tools = buildToolList(rulePack.allowedTools);
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: buildUserPrompt(context),
    },
  ];

  let toolCallCount = 0;
  let findings: Finding[] = [];
  let done = false;

  while (!done) {
    const response = await client.createMessage({
      model: AGENT_MODEL,
      max_tokens: 4096,
      system: rulePack.systemPrompt,
      tools,
      messages,
    });

    // Append assistant turn to the conversation.
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      // Agent finished without calling report_findings — extract any text findings.
      findings = extractFindingsFromText(response.content, rulePack.name);
      done = true;
      continue;
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        // Handle report_findings — extract findings and terminate.
        if (block.name === 'report_findings') {
          const parsed = ReportFindingsInputSchema.safeParse(block.input);
          if (parsed.success) {
            findings = parsed.data.findings.map((f) => ({
              ...f,
              rulePack: rulePack.name,
              suggestion: f.suggestion,
            }));
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ acknowledged: true }),
          });
          done = true;
          continue;
        }

        // Enforce tool allowlist.
        if (!rulePack.allowedTools.includes(block.name)) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ error: `Tool '${block.name}' is not allowed for this rule pack` }),
          });
          continue;
        }

        // Execute the tool.
        let result: string;
        try {
          result = await executeTool(block.name, block.input, context);
        } catch (err: unknown) {
          result = JSON.stringify({ error: `Tool execution failed: ${String(err)}` });
        }

        client.recordToolCall();
        toolCallCount += 1;

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result,
        });
      }

      if (toolResults.length > 0 && !done) {
        messages.push({ role: 'user', content: toolResults });
      }

      // Force conclusion if we've hit the tool call limit.
      if (toolCallCount >= MAX_TOOL_CALLS && !done) {
        findings = await forceConclusion(messages, rulePack, client);
        done = true;
      }
    } else {
      // Unexpected stop reason — treat as done.
      done = true;
    }
  }

  const statsSnapshot = client.getStats();
  return {
    findings,
    tokensUsed: statsSnapshot.inputTokens + statsSnapshot.outputTokens,
    toolCalls: toolCallCount,
    durationMs: Date.now() - start,
  };
}

/**
 * When the agent exhausts its tool budget, send one final message asking it to report findings
 * based only on what it has gathered so far.
 */
async function forceConclusion(
  messages: Anthropic.MessageParam[],
  rulePack: RulePack,
  client: AnthropicClient,
): Promise<Finding[]> {
  const forceMessages: Anthropic.MessageParam[] = [
    ...messages,
    {
      role: 'user',
      content:
        'You have reached the maximum number of tool calls. Call report_findings now with whatever you have found so far. If you found nothing, pass an empty array.',
    },
  ];

  const response = await client.createMessage({
    model: AGENT_MODEL,
    max_tokens: 2048,
    system: rulePack.systemPrompt,
    tools: [reportFindingsTool],
    tool_choice: { type: 'any' },
    messages: forceMessages,
  });

  for (const block of response.content) {
    if (block.type === 'tool_use' && block.name === 'report_findings') {
      const parsed = ReportFindingsInputSchema.safeParse(block.input);
      if (parsed.success) {
        return parsed.data.findings.map((f) => ({
          ...f,
          rulePack: rulePack.name,
          suggestion: f.suggestion,
        }));
      }
    }
  }

  return [];
}

/**
 * Builds the list of Anthropic tool definitions for an agent.
 * Always includes report_findings; includes allowed tools from the pack.
 */
function buildToolList(allowedTools: string[]): Anthropic.Tool[] {
  const allowed = new Set(allowedTools);
  const tools: Anthropic.Tool[] = ALL_TOOL_DEFINITIONS.filter((t) =>
    allowed.has(t.name),
  ) as Anthropic.Tool[];
  tools.push(reportFindingsTool as Anthropic.Tool);
  return tools;
}

/**
 * Builds the initial user message from PR context.
 * Includes a truncated diff to stay within context limits.
 */
function buildUserPrompt(context: PullRequestContext): string {
  const truncatedDiff =
    context.diff.length > 60_000
      ? context.diff.slice(0, 60_000) + '\n\n[diff truncated — use read_file and search_code to explore further]'
      : context.diff;

  const fileList = context.changedFiles
    .map(
      (f) =>
        `  - ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`,
    )
    .join('\n');

  return `# Pull Request: ${context.pr.title}

**Repository:** ${context.repo.owner}/${context.repo.name}
**Author:** ${context.pr.author}
**Base branch:** ${context.pr.baseBranch}
**Primary language:** ${context.repo.language}

## Changed Files
${fileList}

## Diff
\`\`\`diff
${truncatedDiff}
\`\`\`

Analyze this PR according to your instructions and call report_findings when done.`;
}

/**
 * Last-resort findings extraction from plain text when the agent ends without calling report_findings.
 * Returns an empty array in production — this is a fallback for unexpected agent behavior.
 */
function extractFindingsFromText(
  _content: Anthropic.ContentBlock[],
  _rulePackName: string,
): Finding[] {
  return [];
}
