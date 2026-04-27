import * as core from '@actions/core';
import * as github from '@actions/github';
import { Octokit } from '@octokit/rest';
import type { PullRequestContext, ChangedFile, Severity } from '@hallux/shared';
import { reviewPullRequest } from '@hallux/engine';
// Import rule-packs to trigger registration with the engine.
import '@hallux/rule-packs';

/** Entry point for the Hallux GitHub Action. */
async function run(): Promise<void> {
  const anthropicApiKey = core.getInput('anthropic-api-key', { required: true });
  const githubToken = core.getInput('github-token', { required: true });
  const enabledPacksInput = core.getInput('enabled-rule-packs');
  const minSeverityInput = core.getInput('min-severity');

  const enabledRulePacks = enabledPacksInput
    ? enabledPacksInput.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;

  const minSeverity = (minSeverityInput || 'medium') as Severity;

  const ctx = github.context;

  if (ctx.eventName !== 'pull_request' && ctx.eventName !== 'pull_request_target') {
    core.warning(`hallux: triggered on '${ctx.eventName}' event — expected pull_request. Skipping.`);
    core.setOutput('findings_count', '0');
    core.setOutput('severity_max', 'none');
    return;
  }

  const pr = ctx.payload['pull_request'];
  if (!pr) {
    core.setFailed('hallux: could not read pull_request from event payload');
    return;
  }

  core.info(`[hallux] Reviewing PR #${pr['number'] as number}: ${pr['title'] as string}`);

  const octokit = new Octokit({ auth: githubToken });

  // Fetch the PR diff.
  const { data: diffData } = await octokit.pulls.get({
    owner: ctx.repo.owner,
    repo: ctx.repo.repo,
    pull_number: pr['number'] as number,
    mediaType: { format: 'diff' },
  });

  // @octokit/rest returns the raw diff as a string when format: 'diff' is requested.
  const diff = typeof diffData === 'string' ? diffData : JSON.stringify(diffData);

  // Fetch changed files.
  const { data: filesData } = await octokit.pulls.listFiles({
    owner: ctx.repo.owner,
    repo: ctx.repo.repo,
    pull_number: pr['number'] as number,
    per_page: 100,
  });

  const changedFiles: ChangedFile[] = filesData.map((f) => ({
    filename: f.filename,
    status: f.status as ChangedFile['status'],
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch,
    previousFilename: f.previous_filename,
  }));

  const context: PullRequestContext = {
    repo: {
      owner: ctx.repo.owner,
      name: ctx.repo.repo,
      defaultBranch: (pr['base'] as Record<string, unknown>)['ref'] as string,
      language: 'TypeScript', // GitHub doesn't surface language in PR payload; use TypeScript as default
    },
    pr: {
      number: pr['number'] as number,
      title: pr['title'] as string,
      body: (pr['body'] as string | null) ?? '',
      author: (pr['user'] as Record<string, unknown>)['login'] as string,
      baseSha: (pr['base'] as Record<string, unknown>)['sha'] as string,
      headSha: (pr['head'] as Record<string, unknown>)['sha'] as string,
      baseBranch: (pr['base'] as Record<string, unknown>)['ref'] as string,
      headBranch: (pr['head'] as Record<string, unknown>)['ref'] as string,
    },
    diff,
    changedFiles,
    repoPath: process.env['GITHUB_WORKSPACE'],
  };

  core.info(`[hallux] ${changedFiles.length} changed file(s), diff length: ${diff.length} chars`);

  const result = await reviewPullRequest(context, {
    anthropicApiKey,
    enabledRulePacks,
    minSeverity,
  });

  core.info(
    `[hallux] Found ${result.findings.length} finding(s) · ${result.stats.tokensUsed} tokens · ${result.stats.durationMs}ms`,
  );

  // Post the review comment on the PR.
  if (result.markdown) {
    await octokit.issues.createComment({
      owner: ctx.repo.owner,
      repo: ctx.repo.repo,
      issue_number: pr['number'] as number,
      body: result.markdown,
    });
    core.info('[hallux] Posted review comment');
  }

  const severityMax = result.findings.length > 0
    ? (result.findings[0]?.severity ?? 'none')
    : 'none';

  core.setOutput('findings_count', String(result.findings.length));
  core.setOutput('severity_max', severityMax);

  if (result.findings.some((f) => f.severity === 'critical')) {
    core.warning(`[hallux] Critical findings detected — review required`);
  }
}

run().catch((err: unknown) => {
  core.setFailed(`hallux: ${String(err)}`);
});
