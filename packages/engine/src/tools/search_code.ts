import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';

const execFileAsync = promisify(execFile);

/** Zod schema for search_code tool input. */
export const SearchCodeInputSchema = z.object({
  pattern: z.string().min(1).describe('Regex pattern to search for'),
  filePattern: z
    .string()
    .optional()
    .describe('Optional glob pattern to limit which files are searched (e.g. "*.ts", "**/*.test.ts")'),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(25)
    .describe('Maximum number of results to return (default 25, max 100)'),
});

export type SearchCodeInput = z.infer<typeof SearchCodeInputSchema>;

export interface SearchMatch {
  file: string;
  line: number;
  content: string;
}

export interface SearchCodeOutput {
  matches: SearchMatch[];
  truncated: boolean;
}

/**
 * Runs a ripgrep search in the repository.
 * Falls back to a Node.js-based search if ripgrep is not available.
 *
 * @param repoPath - Absolute path to the local repository clone.
 * @param input - Tool input validated against SearchCodeInputSchema.
 */
export async function searchCode(
  repoPath: string,
  input: SearchCodeInput,
): Promise<SearchCodeOutput | { error: string }> {
  const maxResults = input.maxResults ?? 25;

  const args: string[] = [
    '--json',
    '--max-count',
    '1',
    '--max-filesize',
    '1M',
    '-e',
    input.pattern,
  ];

  if (input.filePattern) {
    args.push('--glob', input.filePattern);
  }

  // Exclude common non-source directories.
  args.push(
    '--glob',
    '!node_modules/**',
    '--glob',
    '!dist/**',
    '--glob',
    '!.next/**',
    '--glob',
    '!.turbo/**',
    '.',
  );

  try {
    const { stdout } = await execFileAsync('rg', args, {
      cwd: repoPath,
      maxBuffer: 5 * 1024 * 1024,
    });

    const matches: SearchMatch[] = [];

    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      if (!isRgMatch(parsed)) continue;

      const filePath = path.relative(repoPath, parsed.data.path.text);
      matches.push({
        file: filePath,
        line: parsed.data.line_number,
        content: parsed.data.lines.text.trimEnd(),
      });

      if (matches.length >= maxResults) {
        return { matches, truncated: true };
      }
    }

    return { matches, truncated: false };
  } catch (err: unknown) {
    const exitCode = isExecError(err) ? err.code : undefined;
    // rg exits with code 1 when no matches found — that's not an error.
    if (exitCode === 1) {
      return { matches: [], truncated: false };
    }
    // rg not installed.
    if (exitCode === 'ENOENT' || String(err).includes('ENOENT')) {
      return { error: 'ripgrep (rg) is not installed. Install it to use search_code.' };
    }
    return { error: `Search failed: ${String(err)}` };
  }
}

interface RgMatch {
  type: 'match';
  data: {
    path: { text: string };
    line_number: number;
    lines: { text: string };
  };
}

function isRgMatch(v: unknown): v is RgMatch {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as Record<string, unknown>)['type'] === 'match' &&
    typeof (v as Record<string, unknown>)['data'] === 'object'
  );
}

function isExecError(err: unknown): err is Error & { code: string | number | undefined } {
  return err instanceof Error && 'code' in err;
}

/** Anthropic tool definition for search_code. */
export const searchCodeTool = {
  name: 'search_code' as const,
  description:
    'Search for a regex pattern across the repository source files using ripgrep. Use this to find usages, check if a symbol exists, or understand how something is used.',
  input_schema: {
    type: 'object' as const,
    properties: {
      pattern: {
        type: 'string',
        description: 'Regular expression pattern to search for',
      },
      filePattern: {
        type: 'string',
        description: 'Optional glob pattern to limit which files are searched (e.g. "*.ts", "**/*.test.ts")',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default 25, max 100)',
      },
    },
    required: ['pattern'],
  },
};
