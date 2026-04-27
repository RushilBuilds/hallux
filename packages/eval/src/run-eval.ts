/**
 * Hallux eval harness.
 *
 * Runs every registered rule pack against every fixture PR, computes precision/recall per rule pack,
 * and writes a JSON scoreboard to apps/web/public/benchmark.json.
 *
 * Usage: pnpm --filter=@hallux/eval run eval
 *
 * Requires ANTHROPIC_API_KEY to be set in the environment.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PullRequestContext, Finding } from '@hallux/shared';
import { reviewPullRequest, getRegisteredRulePacks } from '@hallux/engine';
// Import rule-packs to trigger registration side-effect.
import '@hallux/rule-packs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../fixtures');
const OUTPUT_PATH = path.join(__dirname, '../../../apps/web/public/benchmark.json');

interface FixtureFile {
  id: string;
  description: string;
  language: string;
  expectedFindings: Array<{ rulePack: string; file: string; line: number }>;
  context: PullRequestContext;
}

interface FixtureResult {
  fixtureId: string;
  description: string;
  language: string;
  expectedFindings: number;
  actualFindings: Finding[];
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  durationMs: number;
  tokensUsed: number;
}

interface RulePackMetrics {
  precision: number;
  recall: number;
  f1: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
}

export interface BenchmarkResult {
  generatedAt: string;
  totalFixtures: number;
  reviewers: {
    hallux: RulePackMetrics;
  };
  fixtureResults: FixtureResult[];
}

/**
 * Loads all fixture JSON files from the fixtures directory.
 */
async function loadFixtures(): Promise<FixtureFile[]> {
  const files = await fs.readdir(FIXTURES_DIR);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));

  const fixtures: FixtureFile[] = [];
  for (const file of jsonFiles) {
    const content = await fs.readFile(path.join(FIXTURES_DIR, file), 'utf-8');
    fixtures.push(JSON.parse(content) as FixtureFile);
  }

  return fixtures.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Checks if an actual finding matches an expected finding.
 * Matches on rulePack + file + line (within ±2 lines for minor off-by-one tolerance).
 */
function matchesFinding(
  actual: Finding,
  expected: { rulePack: string; file: string; line: number },
): boolean {
  return (
    actual.rulePack === expected.rulePack &&
    actual.file === expected.file &&
    Math.abs(actual.line - expected.line) <= 2
  );
}

/**
 * Runs the eval harness against all fixtures and computes aggregate metrics.
 */
export async function runEval(): Promise<BenchmarkResult> {
  const fixtures = await loadFixtures();
  const registeredPacks = getRegisteredRulePacks();
  console.log(`[eval] Loaded ${fixtures.length} fixtures, ${registeredPacks.length} rule packs`);

  const fixtureResults: FixtureResult[] = [];
  let totalTP = 0;
  let totalFP = 0;
  let totalFN = 0;

  for (const fixture of fixtures) {
    console.log(`\n[eval] Running fixture: ${fixture.id}`);
    const start = Date.now();

    let result: Awaited<ReturnType<typeof reviewPullRequest>>;
    try {
      result = await reviewPullRequest(fixture.context);
    } catch (err: unknown) {
      console.error(`[eval] Fixture ${fixture.id} failed: ${String(err)}`);
      continue;
    }

    const durationMs = Date.now() - start;
    const actual = result.findings;
    const expected = fixture.expectedFindings;

    // Compute TP/FP/FN.
    const matched = new Set<number>();
    let tp = 0;
    let fp = 0;

    for (const a of actual) {
      const matchIdx = expected.findIndex(
        (e, i) => !matched.has(i) && matchesFinding(a, e),
      );
      if (matchIdx >= 0) {
        matched.add(matchIdx);
        tp += 1;
      } else {
        fp += 1;
      }
    }

    const fn = expected.length - tp;

    totalTP += tp;
    totalFP += fp;
    totalFN += fn;

    fixtureResults.push({
      fixtureId: fixture.id,
      description: fixture.description,
      language: fixture.language,
      expectedFindings: expected.length,
      actualFindings: actual,
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
      durationMs,
      tokensUsed: result.stats.tokensUsed,
    });

    console.log(
      `[eval] ${fixture.id}: TP=${tp} FP=${fp} FN=${fn} · ${durationMs}ms · ${result.stats.tokensUsed} tokens`,
    );
  }

  const precision = totalTP / Math.max(totalTP + totalFP, 1);
  const recall = totalTP / Math.max(totalTP + totalFN, 1);
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  const benchmarkResult: BenchmarkResult = {
    generatedAt: new Date().toISOString(),
    totalFixtures: fixtures.length,
    reviewers: {
      hallux: {
        precision: Math.round(precision * 100) / 100,
        recall: Math.round(recall * 100) / 100,
        f1: Math.round(f1 * 100) / 100,
        truePositives: totalTP,
        falsePositives: totalFP,
        falseNegatives: totalFN,
      },
    },
    fixtureResults,
  };

  console.log(`\n[eval] Results: precision=${precision.toFixed(2)} recall=${recall.toFixed(2)} F1=${f1.toFixed(2)}`);

  return benchmarkResult;
}

// Run if invoked directly.
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  runEval()
    .then(async (result) => {
      await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
      await fs.writeFile(OUTPUT_PATH, JSON.stringify(result, null, 2));
      console.log(`\n[eval] Wrote benchmark to ${OUTPUT_PATH}`);
    })
    .catch((err: unknown) => {
      console.error('[eval] Fatal error:', err);
      process.exit(1);
    });
}
