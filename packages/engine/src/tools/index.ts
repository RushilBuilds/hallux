import type { PullRequestContext } from '@hallux/shared';
import { z } from 'zod';
import { readFile, ReadFileInputSchema, readFileTool } from './read_file.js';
import { searchCode, SearchCodeInputSchema, searchCodeTool } from './search_code.js';
import { checkRegistry, CheckRegistryInputSchema, checkRegistryTool } from './check_registry.js';
import { parseAst, ParseAstInputSchema, parseAstTool } from './parse_ast.js';

export { readFileTool, searchCodeTool, checkRegistryTool, parseAstTool };
export type { ReadFileInput, ReadFileOutput } from './read_file.js';
export type { SearchCodeInput, SearchCodeOutput, SearchMatch } from './search_code.js';
export type { CheckRegistryInput, CheckRegistryOutput } from './check_registry.js';
export type { ParseAstInput, ParseAstOutput, AstNode } from './parse_ast.js';

/** All available tool definitions for the Anthropic API. */
export const ALL_TOOL_DEFINITIONS = [
  readFileTool,
  searchCodeTool,
  checkRegistryTool,
  parseAstTool,
] as const;

export type ToolName = 'read_file' | 'search_code' | 'check_registry' | 'parse_ast';

/** The report_findings tool — called by the agent to submit structured results. */
export const reportFindingsTool = {
  name: 'report_findings' as const,
  description:
    'Submit your analysis findings. Call this tool exactly once when you have completed your analysis. If you found no issues, pass an empty array.',
  input_schema: {
    type: 'object' as const,
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            file: { type: 'string', description: 'Path relative to repo root' },
            line: { type: 'number', description: '1-indexed line number' },
            message: { type: 'string', description: 'Clear description of the issue' },
            severity: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low'],
              description: 'Severity of the finding',
            },
            suggestion: {
              type: 'string',
              description: 'Optional suggested fix or replacement',
            },
          },
          required: ['file', 'line', 'message', 'severity'],
        },
        description: 'Array of findings from your analysis (empty array if none found)',
      },
    },
    required: ['findings'],
  },
};

/** Zod schema used to validate report_findings input at runtime. */
export const ReportFindingsInputSchema = z.object({
  findings: z.array(
    z.object({
      file: z.string(),
      line: z.number().int().min(1),
      message: z.string().min(1),
      severity: z.enum(['critical', 'high', 'medium', 'low']),
      suggestion: z.string().optional(),
    }),
  ),
});

export type ReportFindingsInput = z.infer<typeof ReportFindingsInputSchema>;

/**
 * Executes a named tool with the given raw input, validating input with zod.
 * Returns a JSON-serializable result string for the tool_result content block.
 */
export async function executeTool(
  toolName: string,
  rawInput: unknown,
  context: PullRequestContext,
): Promise<string> {
  const repoPath = context.repoPath ?? process.cwd();

  switch (toolName) {
    case 'read_file': {
      const input = ReadFileInputSchema.parse(rawInput);
      const result = await readFile(repoPath, input);
      return JSON.stringify(result);
    }
    case 'search_code': {
      const input = SearchCodeInputSchema.parse(rawInput);
      const result = await searchCode(repoPath, input);
      return JSON.stringify(result);
    }
    case 'check_registry': {
      const input = CheckRegistryInputSchema.parse(rawInput);
      const result = await checkRegistry(input);
      return JSON.stringify(result);
    }
    case 'parse_ast': {
      const input = ParseAstInputSchema.parse(rawInput);
      const result = await parseAst(input);
      return JSON.stringify(result);
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}
