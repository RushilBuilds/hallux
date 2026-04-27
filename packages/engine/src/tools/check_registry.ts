import { z } from 'zod';

/** Zod schema for check_registry tool input. */
export const CheckRegistryInputSchema = z.object({
  name: z.string().min(1).describe('Package name to check'),
  version: z
    .string()
    .optional()
    .describe('Specific version to verify (e.g. "4.2.1", "^4.0.0")'),
  language: z
    .enum(['npm', 'pypi'])
    .describe('Registry to check: "npm" for JavaScript/TypeScript, "pypi" for Python'),
});

export type CheckRegistryInput = z.infer<typeof CheckRegistryInputSchema>;

export interface CheckRegistryOutput {
  exists: boolean;
  latestVersion?: string | undefined;
  /** Only populated when `version` was specified in the input. */
  versionExists?: boolean | undefined;
  description?: string | undefined;
}

/**
 * Queries the npm or PyPI registry to verify that a package (and optionally a version) exists.
 *
 * @param input - Tool input validated against CheckRegistryInputSchema.
 */
export async function checkRegistry(
  input: CheckRegistryInput,
): Promise<CheckRegistryOutput | { error: string }> {
  try {
    if (input.language === 'npm') {
      return await checkNpm(input.name, input.version);
    } else {
      return await checkPypi(input.name, input.version);
    }
  } catch (err: unknown) {
    return { error: `Registry check failed: ${String(err)}` };
  }
}

async function checkNpm(
  name: string,
  version?: string,
): Promise<CheckRegistryOutput | { error: string }> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err: unknown) {
    return { error: `Network error querying npm: ${String(err)}` };
  }

  if (response.status === 404) {
    return { exists: false };
  }

  if (!response.ok) {
    return { error: `npm registry returned ${response.status}` };
  }

  const body = (await response.json()) as NpmPackage;
  const latestVersion = body['dist-tags']?.['latest'];

  if (!version) {
    return {
      exists: true,
      latestVersion,
      description: body.description,
    };
  }

  // Normalize the requested version — strip leading ^ ~ >= etc. for exact lookup.
  const normalized = version.replace(/^[~^>=<]+/, '').trim();
  const versionExists = Object.prototype.hasOwnProperty.call(body.versions ?? {}, normalized);

  return {
    exists: true,
    latestVersion,
    versionExists,
    description: body.description,
  };
}

async function checkPypi(
  name: string,
  version?: string,
): Promise<CheckRegistryOutput | { error: string }> {
  const url = `https://pypi.org/pypi/${encodeURIComponent(name)}/json`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err: unknown) {
    return { error: `Network error querying PyPI: ${String(err)}` };
  }

  if (response.status === 404) {
    return { exists: false };
  }

  if (!response.ok) {
    return { error: `PyPI returned ${response.status}` };
  }

  const body = (await response.json()) as PypiPackage;
  const latestVersion = body.info?.version;

  if (!version) {
    return {
      exists: true,
      latestVersion,
      description: body.info?.summary,
    };
  }

  const normalized = version.replace(/^[~^>=<]+/, '').trim();
  const versionExists = Object.prototype.hasOwnProperty.call(body.releases ?? {}, normalized);

  return {
    exists: true,
    latestVersion,
    versionExists,
    description: body.info?.summary,
  };
}

interface NpmPackage {
  description?: string;
  'dist-tags'?: Record<string, string>;
  versions?: Record<string, unknown>;
}

interface PypiPackage {
  info?: { version?: string; summary?: string };
  releases?: Record<string, unknown>;
}

/** Anthropic tool definition for check_registry. */
export const checkRegistryTool = {
  name: 'check_registry' as const,
  description:
    'Query the npm or PyPI registry to verify that a package exists and that a specific version is published. Use this when you see an import and want to confirm the package is real.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'Package name (e.g. "lodash", "react-query", "requests")',
      },
      version: {
        type: 'string',
        description: 'Specific version string to verify (e.g. "4.2.1"). Optional.',
      },
      language: {
        type: 'string',
        enum: ['npm', 'pypi'],
        description: '"npm" for JavaScript/TypeScript packages, "pypi" for Python packages',
      },
    },
    required: ['name', 'language'],
  },
};
