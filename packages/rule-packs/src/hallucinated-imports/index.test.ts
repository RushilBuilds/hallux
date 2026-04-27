import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hallucinatedImportsRulePack } from './index.js';
import type { RulePack } from '@hallux/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '../../../eval/fixtures');

function loadFixture(name: string): Record<string, unknown> {
  const raw = fs.readFileSync(path.join(FIXTURES_DIR, `${name}.json`), 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

describe('hallucinated-imports rule pack', () => {
  it('has the expected shape', () => {
    const pack: RulePack = hallucinatedImportsRulePack;
    expect(pack.name).toBe('hallucinated-imports');
    expect(pack.severity).toBe('critical');
    expect(pack.allowedTools).toContain('check_registry');
    expect(pack.allowedTools).toContain('parse_ast');
    expect(pack.systemPrompt.length).toBeGreaterThan(100);
  });

  it('positive fixture contains hallucinated imports in the diff', () => {
    const fixture = loadFixture('hallucinated-imports-positive');
    const context = fixture['context'] as { diff: string };
    const expected = fixture['expectedFindings'] as unknown[];
    expect(context.diff).toContain('import');
    expect(expected.length).toBeGreaterThan(0);
  });

  it('negative fixture has no expected findings', () => {
    const fixture = loadFixture('hallucinated-imports-negative');
    const expected = fixture['expectedFindings'] as unknown[];
    expect(expected).toHaveLength(0);
  });

  it('positive fixture diff contains the expected bad package', () => {
    const fixture = loadFixture('hallucinated-imports-positive');
    const context = fixture['context'] as { diff: string };
    expect(context.diff).toContain('@anthropic-ai/telemetry-sdk');
  });
});
