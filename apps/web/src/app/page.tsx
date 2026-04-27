import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const WORKFLOW_SNIPPET = `name: Hallux PR Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  hallux:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: hallux/hallux@v0.1
        with:
          anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}
          github-token: \${{ secrets.GITHUB_TOKEN }}`;

interface BenchmarkSummary {
  reviewers: {
    hallux: { precision: number; recall: number; f1: number };
  };
  totalFixtures: number;
}

function loadBenchmarkSummary(): BenchmarkSummary | null {
  try {
    const filePath = path.join(process.cwd(), 'public', 'benchmark.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as BenchmarkSummary;
  } catch {
    return null;
  }
}

export default function HomePage() {
  const benchmark = loadBenchmarkSummary();

  return (
    <main>
      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-6 py-24 lg:py-32">
          <div className="mb-4 inline-flex items-center rounded-full border border-accent/30 bg-accent-dim px-3 py-1">
            <span className="font-mono text-xs text-accent">v0.1 — public beta</span>
          </div>

          <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Your AI is writing code
            <br />
            <span className="text-accent">your AI can&apos;t review.</span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg text-foreground-muted leading-relaxed">
            Hallux is a GitHub Action that catches the failure modes generic reviewers miss:
            hallucinated imports, phantom tests, and fabricated method calls — the bugs AI
            models write with perfect confidence.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="https://github.com/hallux/hallux"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 transition-all duration-150 bg-accent text-background font-semibold hover:opacity-90 active:opacity-80 px-6 py-3 text-base rounded-lg font-mono"
            >
              Install on GitHub
            </a>
            <Link
              href="/benchmark"
              className="inline-flex items-center justify-center gap-2 transition-all duration-150 border border-card-border bg-transparent text-foreground hover:bg-accent-dim hover:border-accent px-6 py-3 text-base rounded-lg font-mono"
            >
              View benchmark
            </Link>
          </div>
        </div>
      </section>

      {/* ── Problem statement ─────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="font-mono text-xs uppercase tracking-widest text-foreground-muted">
            The problem
          </h2>
          <p className="mt-4 max-w-3xl text-2xl font-semibold leading-snug text-foreground">
            AI-generated PRs aren&apos;t reviewed like human-written ones. They shouldn&apos;t be.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <Card className="border-accent/20">
              <CardContent>
                <p className="font-mono text-3xl font-bold text-accent">91%</p>
                <p className="mt-2 text-sm text-foreground-muted">
                  More time spent in review on AI-assisted PRs vs human-written ones
                  <span className="block mt-1 text-xs opacity-60">— GitHub research, 2024</span>
                </p>
              </CardContent>
            </Card>

            <Card className="border-accent/20">
              <CardContent>
                <p className="font-mono text-3xl font-bold text-accent">75%</p>
                <p className="mt-2 text-sm text-foreground-muted">
                  More logic errors in AI-generated code that passes generic review
                  <span className="block mt-1 text-xs opacity-60">— GitHub research, 2024</span>
                </p>
              </CardContent>
            </Card>
          </div>

          <blockquote className="mt-8 border-l-2 border-accent pl-5 text-foreground-muted text-base leading-relaxed">
            Generic reviewers (CodeRabbit, Greptile, Cursor BugBot) treat AI-generated PRs the
            same as human-written ones. Hallux was built specifically for the class of errors AI
            models produce — the ones that look correct to a human reviewer but fail at runtime.
          </blockquote>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="font-mono text-xs uppercase tracking-widest text-foreground-muted">
            How it works
          </h2>
          <p className="mt-4 text-2xl font-semibold text-foreground">
            Three rule packs. Three failure modes. Zero false confidence.
          </p>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="critical">critical</Badge>
                </div>
                <CardTitle>Hallucinated imports</CardTitle>
                <CardDescription>
                  Parses every import in the diff, queries npm and PyPI to verify the package
                  exists, and flags non-existent named exports from real packages.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="text-xs text-red-400 bg-red-950/20 rounded-md p-3 overflow-x-auto">
                  <code>{`import { useAutoRefresh }
  from '@tanstack/react-query'
// ✗ useAutoRefresh does not exist`}</code>
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="high">high</Badge>
                </div>
                <CardTitle>Phantom tests</CardTitle>
                <CardDescription>
                  Detects tests with zero assertions, mock-only tests, and smoke tests that
                  never check return values — tests that always pass but verify nothing.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="text-xs text-orange-400 bg-orange-950/20 rounded-md p-3 overflow-x-auto">
                  <code>{`it('should process payment', async () => {
  const result = await pay(mock);
  expect(result).toBeDefined();
  // ✗ No meaningful assertion`}</code>
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="critical">critical</Badge>
                </div>
                <CardTitle>Fabricated methods</CardTitle>
                <CardDescription>
                  Identifies calls to methods that don&apos;t exist on the receiver type —
                  plausible-sounding names that JavaScript built-ins don&apos;t actually have.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="text-xs text-red-400 bg-red-950/20 rounded-md p-3 overflow-x-auto">
                  <code>{`users.filterWhere(u => u.active)
// ✗ Array.prototype.filterWhere
//   does not exist`}</code>
                </pre>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ── Install snippet ───────────────────────────────────── */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="font-mono text-xs uppercase tracking-widest text-foreground-muted">
            Install
          </h2>
          <p className="mt-4 text-2xl font-semibold text-foreground">
            Add to your repo in 60 seconds.
          </p>

          <div className="mt-8 rounded-xl border border-card-border bg-card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-card-border bg-background px-4 py-2.5">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
              <span className="ml-2 font-mono text-xs text-foreground-muted">
                .github/workflows/hallux.yml
              </span>
            </div>
            <pre className="overflow-x-auto p-5 text-sm text-foreground font-mono leading-relaxed">
              <code>{WORKFLOW_SNIPPET}</code>
            </pre>
          </div>

          <p className="mt-4 text-sm text-foreground-muted">
            Add <code className="text-accent">ANTHROPIC_API_KEY</code> to your repository
            secrets under Settings → Secrets and variables → Actions.
          </p>
        </div>
      </section>

      {/* ── Benchmark preview ─────────────────────────────────── */}
      {benchmark && (
        <section className="border-b border-border">
          <div className="mx-auto max-w-5xl px-6 py-20">
            <h2 className="font-mono text-xs uppercase tracking-widest text-foreground-muted">
              Benchmark
            </h2>
            <p className="mt-4 text-2xl font-semibold text-foreground">
              Measured against {benchmark.totalFixtures} labeled fixture PRs.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {(
                [
                  { label: 'Precision', value: benchmark.reviewers.hallux.precision },
                  { label: 'Recall', value: benchmark.reviewers.hallux.recall },
                  { label: 'F1 Score', value: benchmark.reviewers.hallux.f1 },
                ] as const
              ).map(({ label, value }) => (
                <Card key={label} className="text-center">
                  <CardContent>
                    <p className="font-mono text-3xl font-bold text-accent">
                      {(value * 100).toFixed(0)}%
                    </p>
                    <p className="mt-1 text-sm text-foreground-muted">{label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="mt-6">
              <Link
                href="/benchmark"
                className="inline-flex items-center justify-center gap-2 transition-all duration-150 border border-card-border bg-transparent text-foreground hover:bg-accent-dim hover:border-accent px-4 py-2 text-sm rounded-lg font-mono"
              >
                View full scoreboard
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl px-6 py-10 flex flex-wrap items-center justify-between gap-4 text-sm text-foreground-muted">
          <div className="font-mono">
            <span className="text-accent">hallux</span> v0.1
          </div>
          <nav className="flex gap-6 font-mono text-xs">
            <a
              href="https://github.com/hallux/hallux"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://x.com/halluxreview"
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground transition-colors"
            >
              X
            </a>
            <span>MIT License</span>
          </nav>
        </div>
      </footer>
    </main>
  );
}
