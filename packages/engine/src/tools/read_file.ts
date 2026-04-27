import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

/** Zod schema for read_file tool input. */
export const ReadFileInputSchema = z.object({
  path: z
    .string()
    .min(1)
    .describe('Path to the file relative to the repository root'),
});

export type ReadFileInput = z.infer<typeof ReadFileInputSchema>;

export interface ReadFileOutput {
  content: string;
  lines: number;
}

/**
 * Reads a file from the cloned repository.
 * Validates that the resolved path stays within the repo root (prevents path traversal).
 *
 * @param repoPath - Absolute path to the local repository clone.
 * @param input - Tool input validated against ReadFileInputSchema.
 * @returns File content and line count, or an error string if the file cannot be read.
 */
export async function readFile(
  repoPath: string,
  input: ReadFileInput,
): Promise<ReadFileOutput | { error: string }> {
  const resolved = path.resolve(repoPath, input.path);

  // Guard against path traversal attacks.
  if (!resolved.startsWith(path.resolve(repoPath))) {
    return { error: 'Path traversal detected — path must be within the repository root' };
  }

  try {
    const content = await fs.readFile(resolved, 'utf-8');
    const lines = content.split('\n').length;
    return { content, lines };
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      return { error: `File not found: ${input.path}` };
    }
    if (isNodeError(err) && err.code === 'EISDIR') {
      return { error: `Path is a directory, not a file: ${input.path}` };
    }
    return { error: `Failed to read file: ${String(err)}` };
  }
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

/** Anthropic tool definition for read_file. */
export const readFileTool = {
  name: 'read_file' as const,
  description:
    'Read the contents of a file in the repository. Use this to examine source files, test files, or configuration files mentioned in the diff.',
  input_schema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file relative to the repository root (e.g. "src/utils/fetch.ts")',
      },
    },
    required: ['path'],
  },
};
