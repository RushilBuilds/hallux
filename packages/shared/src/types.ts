/**
 * Metadata for a single changed file in a pull request.
 */
export interface ChangedFile {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  /** The unified diff patch for this file, if available. */
  patch?: string | undefined;
  /** If renamed, the previous filename. */
  previousFilename?: string | undefined;
}

/**
 * Full context passed to every rule pack agent.
 * Contains PR metadata, the full diff, and optional local repo path for tool use.
 */
export interface PullRequestContext {
  repo: {
    owner: string;
    name: string;
    defaultBranch: string;
    /** Primary language detected by GitHub. */
    language: string;
  };
  pr: {
    number: number;
    title: string;
    body: string;
    author: string;
    baseSha: string;
    headSha: string;
    baseBranch: string;
    headBranch: string;
  };
  /** Full unified diff of the PR. */
  diff: string;
  changedFiles: ChangedFile[];
  /**
   * Absolute path to a local clone of the repository at the PR head.
   * Required for tools that read file contents (read_file, search_code, parse_ast).
   */
  repoPath?: string | undefined;
}

/** Severity levels, ordered from most to least severe. */
export type Severity = 'critical' | 'high' | 'medium' | 'low';

/**
 * A single issue found by a rule pack agent.
 */
export interface Finding {
  /** The rule pack that produced this finding. */
  rulePack: string;
  severity: Severity;
  /** Path relative to repo root. */
  file: string;
  /** 1-indexed line number. */
  line: number;
  /** Human-readable description of the issue. */
  message: string;
  /** Optional fix suggestion shown in the PR comment. */
  suggestion?: string | undefined;
}

/**
 * The complete result of reviewing a pull request.
 */
export interface ReviewResult {
  findings: Finding[];
  stats: {
    tokensUsed: number;
    toolCalls: number;
    durationMs: number;
  };
}

/**
 * Options controlling how reviewPullRequest behaves.
 */
export interface ReviewOptions {
  /** Which rule packs to run. Defaults to all registered packs. */
  enabledRulePacks?: string[] | undefined;
  /** Minimum severity to include in results. Defaults to 'medium'. */
  minSeverity?: Severity | undefined;
  /** Anthropic API key. Falls back to ANTHROPIC_API_KEY env var. */
  anthropicApiKey?: string | undefined;
}

/**
 * Interface every rule pack module must implement.
 */
export interface RulePack {
  /** Unique machine-readable name, e.g. 'hallucinated-imports'. */
  name: string;
  /** Default severity level for findings from this pack. */
  severity: Severity;
  /** System prompt injected into the agent for this rule pack. */
  systemPrompt: string;
  /** Names of tools the agent for this pack is allowed to call. */
  allowedTools: string[];
}

/**
 * Severity ordering — higher index = lower severity.
 */
export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

/**
 * Returns true if `a` is at least as severe as `b`.
 */
export function isAtLeastSeverity(a: Severity, b: Severity): boolean {
  return SEVERITY_ORDER.indexOf(a) <= SEVERITY_ORDER.indexOf(b);
}
