import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { phantomTestsRulePack } from './index.js';
import type { RulePack } from '@hallux/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '../../../eval/fixtures');

function loadFixture(name: string): Record<string, unknown> {
  const raw = fs.readFileSync(path.join(FIXTURES_DIR, `${name}.json`), 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

describe('phantom-tests rule pack', () => {
  it('has the expected shape', () => {
    const pack: RulePack = phantomTestsRulePack;
    expect(pack.name).toBe('phantom-tests');
    expect(pack.severity).toBe('high');
    expect(pack.allowedTools).toContain('parse_ast');
    expect(pack.allowedTools).toContain('read_file');
    expect(pack.systemPrompt.length).toBeGreaterThan(100);
  });

  it('positive fixture contains phantom test patterns in the diff', () => {
    const fixture = loadFixture('phantom-tests-positive');
    const context = fixture['context'] as { diff: string };
    const expected = fixture['expectedFindings'] as unknown[];
    expect(context.diff).toContain('it(');
    expect(expected.length).toBeGreaterThan(0);
  });

  it('negative fixture has no expected findings', () => {
    const fixture = loadFixture('phantom-tests-negative');
    const expected = fixture['expectedFindings'] as unknown[];
    expect(expected).toHaveLength(0);
  });

  it('positive fixture diff contains tests without real assertions', () => {
    const fixture = loadFixture('phantom-tests-positive');
    const context = fixture['context'] as { diff: string };
    expect(context.diff).toContain('toBeDefined');
    // Confirm there are no strict equality checks
    expect(context.diff).not.toContain('toStrictEqual');
  });
});
