import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { BadgeVariant } from '@/components/ui/badge';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Benchmark — Hallux',
  description: 'Full scoreboard: Hallux accuracy on labeled AI-generated PR fixtures',
};

interface Finding {
  rulePack: string;
  file: string;
  line: number;
  message: string;
  severity: string;
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

interface BenchmarkData {
  generatedAt: string;
  totalFixtures: number;
  reviewers: {
    hallux: {
      precision: number;
      recall: number;
      f1: number;
      truePositives: number;
      falsePositives: number;
      falseNegatives: number;
    };
  };
  fixtureResults: FixtureResult[];
}

function loadBenchmark(): BenchmarkData | null {
  try {
    const filePath = path.join(process.cwd(), 'public', 'benchmark.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as BenchmarkData;
  } catch {
    return null;
  }
}

function verdictBadge(tp: number, fn: number, fp: number) {
  if (fp === 0 && fn === 0 && tp > 0) return <Badge variant="default">pass</Badge>;
  if (fp === 0 && fn === 0 && tp === 0) return <Badge variant="outline">clean</Badge>;
  if (tp > 0 && (fp > 0 || fn > 0)) return <Badge variant="medium">partial</Badge>;
  return <Badge variant="critical">miss</Badge>;
}

function RulePackBadge({ name }: { name: string }) {
  const variants: Record<string, BadgeVariant> = {
    'hallucinated-imports': 'critical',
    'phantom-tests': 'high',
    'fabricated-methods': 'critical',
  };
  return (
    <Badge variant={variants[name] ?? 'outline'} className="font-mono text-xs">
      {name}
    </Badge>
  );
}

export default function BenchmarkPage() {
  const data = loadBenchmark();

  if (!data) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-24">
        <p className="text-foreground-muted text-sm font-mono">
          benchmark.json not found. Run{' '}
          <code className="text-accent">pnpm --filter=@hallux/eval run eval</code> to generate it.
        </p>
      </main>
    );
  }

  const h = data.reviewers.hallux;

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      {/* Header */}
      <div className="mb-2">
        <Link
          href="/"
          className="font-mono text-xs text-foreground-muted hover:text-foreground transition-colors"
        >
          ← hallux
        </Link>
      </div>

      <h1 className="text-3xl font-bold tracking-tight text-foreground mt-4">Benchmark</h1>
      <p className="mt-2 text-foreground-muted text-sm">
        {data.totalFixtures} labeled fixture PRs · last run{' '}
        {new Date(data.generatedAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </p>

      {/* Summary row */}
      <div className="mt-10 grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { label: 'Precision', value: `${(h.precision * 100).toFixed(0)}%` },
          { label: 'Recall', value: `${(h.recall * 100).toFixed(0)}%` },
          { label: 'F1 Score', value: `${(h.f1 * 100).toFixed(0)}%` },
          { label: 'True Positives', value: String(h.truePositives) },
          { label: 'False Positives', value: String(h.falsePositives) },
        ].map(({ label, value }) => (
          <Card key={label} className="text-center">
            <CardContent>
              <p className="font-mono text-2xl font-bold text-accent">{value}</p>
              <p className="mt-0.5 text-xs text-foreground-muted">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Fixture table */}
      <div className="mt-12">
        <h2 className="font-mono text-xs uppercase tracking-widest text-foreground-muted mb-4">
          Per-fixture results
        </h2>
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fixture</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>TP / FP / FN</TableHead>
                <TableHead>Verdict</TableHead>
                <TableHead>Tokens</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.fixtureResults.map((r) => (
                <TableRow key={r.fixtureId}>
                  <TableCell>
                    <div>
                      <p className="font-mono text-xs text-accent">{r.fixtureId}</p>
                      <p className="text-xs text-foreground-muted mt-0.5 max-w-xs">{r.description}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.language}</Badge>
                  </TableCell>
                  <TableCell className="font-mono">{r.expectedFindings}</TableCell>
                  <TableCell>
                    <span className="font-mono text-xs">
                      <span className="text-accent">{r.truePositives}</span>
                      <span className="text-foreground-muted"> / </span>
                      <span className="text-red-400">{r.falsePositives}</span>
                      <span className="text-foreground-muted"> / </span>
                      <span className="text-orange-400">{r.falseNegatives}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    {verdictBadge(r.truePositives, r.falseNegatives, r.falsePositives)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-foreground-muted">
                    {r.tokensUsed.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Findings breakdown */}
      {data.fixtureResults.some((r) => r.actualFindings.length > 0) && (
        <div className="mt-12">
          <h2 className="font-mono text-xs uppercase tracking-widest text-foreground-muted mb-4">
            Findings detail
          </h2>
          {data.fixtureResults
            .filter((r) => r.actualFindings.length > 0)
            .map((r) => (
              <div key={r.fixtureId} className="mb-6">
                <p className="font-mono text-sm text-accent mb-2">{r.fixtureId}</p>
                <Card className="p-0 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rule Pack</TableHead>
                        <TableHead>File</TableHead>
                        <TableHead>Line</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Severity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {r.actualFindings.map((f, i) => (
                        <TableRow key={`${f.file}-${f.line}-${i}`}>
                          <TableCell>
                            <RulePackBadge name={f.rulePack} />
                          </TableCell>
                          <TableCell className="font-mono text-xs">{f.file}</TableCell>
                          <TableCell className="font-mono">{f.line}</TableCell>
                          <TableCell className="text-xs max-w-sm">{f.message}</TableCell>
                          <TableCell>
                            <Badge variant={f.severity as BadgeVariant}>{f.severity}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              </div>
            ))}
        </div>
      )}
    </main>
  );
}
