import { describe, it, expect } from 'vitest';
import { parseAst } from './parse_ast.js';

describe('parseAst — TypeScript', () => {
  const tsCode = `
import { useState, useEffect } from 'react';
import type { FC } from 'react';
import axios from 'axios';

export function MyComponent() {
  const [data, setData] = useState(null);
  useEffect(() => {
    axios.get('/api').then(r => setData(r.data));
  }, []);
  return null;
}
`.trim();

  it('extracts imports', async () => {
    const result = await parseAst({ code: tsCode, language: 'typescript', extract: 'imports' });
    expect('error' in result).toBe(false);
    if ('error' in result) return;

    const sources = result.nodes.map((n) => n.extra?.['source']);
    expect(sources).toContain('react');
    expect(sources).toContain('axios');
  });

  it('extracts function declarations', async () => {
    const result = await parseAst({ code: tsCode, language: 'typescript', extract: 'functions' });
    expect('error' in result).toBe(false);
    if ('error' in result) return;

    const names = result.nodes.map((n) => n.name);
    expect(names).toContain('MyComponent');
  });

  it('extracts method calls', async () => {
    const code = `
const arr = [1, 2, 3];
const result = arr.filter(x => x > 1);
arr.forEach(x => console.log(x));
`.trim();

    const result = await parseAst({ code, language: 'typescript', extract: 'calls' });
    expect('error' in result).toBe(false);
    if ('error' in result) return;

    const methodNames = result.nodes.map((n) => n.name);
    expect(methodNames).toContain('filter');
    expect(methodNames).toContain('forEach');
  });
});

describe('parseAst — Python', async () => {
  const pyCode = `
import os
import sys
from pathlib import Path
from typing import Optional, List

def read_config(path: str) -> Optional[dict]:
    with open(path) as f:
        return json.load(f)

class ConfigLoader:
    pass
`.trim();

  it('extracts imports', async () => {
    const result = await parseAst({ code: pyCode, language: 'python', extract: 'imports' });
    expect('error' in result).toBe(false);
    if ('error' in result) return;

    const names = result.nodes.map((n) => n.name);
    expect(names).toContain('os');
    expect(names).toContain('sys');
    expect(names).toContain('Path');
  });

  it('extracts function definitions', async () => {
    const result = await parseAst({ code: pyCode, language: 'python', extract: 'functions' });
    expect('error' in result).toBe(false);
    if ('error' in result) return;

    const names = result.nodes.map((n) => n.name);
    expect(names).toContain('read_config');
  });

  it('extracts class definitions', async () => {
    const result = await parseAst({ code: pyCode, language: 'python', extract: 'classes' });
    expect('error' in result).toBe(false);
    if ('error' in result) return;

    const names = result.nodes.map((n) => n.name);
    expect(names).toContain('ConfigLoader');
  });
});
