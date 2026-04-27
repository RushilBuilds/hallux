import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fabricatedMethodsRulePack } from './index.js';
import type { RulePack } from '@hallux/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '../../../eval/fixtures');

function loadFixture(name: string): Record<string, unknown> {
  const raw = fs.readFileSync(path.join(FIXTURES_DIR, `${name}.json`), 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

describe('fabricated-methods rule pack', () => {
  it('has the expected shape', () => {
    const pack: RulePack = fabricatedMethodsRulePack;
    expect(pack.name).toBe('fabricated-methods');
    expect(pack.severity).toBe('critical');
    expect(pack.allowedTools).toContain('parse_ast');
    expect(pack.allowedTools).toContain('read_file');
    expect(pack.systemPrompt.length).toBeGreaterThan(100);
  });

  it('positive fixture contains fabricated method calls in the diff', () => {
    const fixture = loadFixture('fabricated-methods-positive');
    const context = fixture['context'] as { diff: string };
    const expected = fixture['expectedFindings'] as unknown[];
    expect(context.diff.length).toBeGreaterThan(0);
    expect(expected.length).toBeGreaterThan(0);
  });

  it('negative fixture has no expected findings', () => {
    const fixture = loadFixture('fabricated-methods-negative');
    const expected = fixture['expectedFindings'] as unknown[];
    expect(expected).toHaveLength(0);
  });

  it('positive fixture diff contains the hallucinated filterWhere method', () => {
    const fixture = loadFixture('fabricated-methods-positive');
    const context = fixture['context'] as { diff: string };
    expect(context.diff).toContain('filterWhere');
  });

  it('positive fixture diff contains the hallucinated replaceAllOccurrences method', () => {
    const fixture = loadFixture('fabricated-methods-positive');
    const context = fixture['context'] as { diff: string };
    expect(context.diff).toContain('replaceAllOccurrences');
  });

  it('negative fixture uses real built-in methods', () => {
    const fixture = loadFixture('fabricated-methods-negative');
    const context = fixture['context'] as { diff: string };
    expect(context.diff).toContain('.filter(');
    expect(context.diff).toContain('.replaceAll(');
  });
});
