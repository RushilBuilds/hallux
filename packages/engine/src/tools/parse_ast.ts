import { z } from 'zod';

/** Zod schema for parse_ast tool input. */
export const ParseAstInputSchema = z.object({
  code: z.string().min(1).describe('Source code to parse'),
  language: z
    .enum(['typescript', 'javascript', 'python'])
    .describe('Language of the source code'),
  extract: z
    .enum(['imports', 'functions', 'classes', 'calls', 'exports'])
    .describe('Which AST nodes to extract'),
});

export type ParseAstInput = z.infer<typeof ParseAstInputSchema>;

export interface AstNode {
  kind: string;
  name?: string | undefined;
  line: number;
  column: number;
  /** Extra data specific to the node kind (e.g. import source, call receiver). */
  extra?: Record<string, unknown> | undefined;
}

export interface ParseAstOutput {
  nodes: AstNode[];
  language: string;
}

/**
 * Parses source code and extracts structural nodes (imports, functions, method calls, etc.).
 * TypeScript/JavaScript parsing uses @typescript-eslint/typescript-estree.
 * Python parsing produces a best-effort extract using pattern matching (tree-sitter-python
 * integration is planned for v0.2 when native binding requirements are resolved).
 *
 * @param input - Tool input validated against ParseAstInputSchema.
 */
export async function parseAst(
  input: ParseAstInput,
): Promise<ParseAstOutput | { error: string }> {
  try {
    if (input.language === 'typescript' || input.language === 'javascript') {
      return await parseTsJs(input.code, input.language, input.extract);
    } else if (input.language === 'python') {
      return parsePython(input.code, input.extract);
    }
    return { error: `Unsupported language: ${input.language}` };
  } catch (err: unknown) {
    return { error: `AST parse failed: ${String(err)}` };
  }
}

async function parseTsJs(
  code: string,
  language: 'typescript' | 'javascript',
  extract: ParseAstInput['extract'],
): Promise<ParseAstOutput> {
  // Dynamically import to avoid loading @typescript-eslint/typescript-estree at startup.
  const { parse } = await import('@typescript-eslint/typescript-estree');

  const ast = parse(code, {
    jsx: true,
    loc: true,
    range: true,
    tolerant: true,
    errorOnTypeScriptSyntacticAndSemanticIssues: false,
  });

  const nodes: AstNode[] = [];
  walkNode(ast as unknown as AstAny, extract, nodes);

  return { nodes, language };
}

type AstAny = {
  type: string;
  loc?: { start: { line: number; column: number } };
  [key: string]: unknown;
};

function walkNode(node: AstAny, extract: ParseAstInput['extract'], acc: AstNode[]): void {
  if (!node || typeof node !== 'object') return;

  switch (extract) {
    case 'imports':
      if (node['type'] === 'ImportDeclaration') {
        const specifiers = (node['specifiers'] as AstAny[] | undefined) ?? [];
        for (const spec of specifiers) {
          acc.push({
            kind: 'import',
            name: String((spec['imported'] as AstAny | undefined)?.['name'] ?? (spec['local'] as AstAny | undefined)?.['name'] ?? 'default'),
            line: node['loc']?.start.line ?? 0,
            column: node['loc']?.start.column ?? 0,
            extra: { source: node['source'] ? String((node['source'] as AstAny)['value']) : undefined },
          });
        }
        // Handle namespace imports: import * as Foo from '...'
        if (specifiers.length === 0) {
          acc.push({
            kind: 'import',
            name: '*',
            line: node['loc']?.start.line ?? 0,
            column: node['loc']?.start.column ?? 0,
            extra: { source: String((node['source'] as AstAny)['value'] ?? '') },
          });
        }
      }
      break;

    case 'functions':
      if (
        node['type'] === 'FunctionDeclaration' ||
        node['type'] === 'FunctionExpression' ||
        node['type'] === 'ArrowFunctionExpression'
      ) {
        const id = node['id'] as AstAny | undefined;
        acc.push({
          kind: node['type'],
          name: id ? String(id['name']) : undefined,
          line: node['loc']?.start.line ?? 0,
          column: node['loc']?.start.column ?? 0,
        });
      }
      break;

    case 'calls':
      if (node['type'] === 'CallExpression') {
        const callee = node['callee'] as AstAny | undefined;
        let name: string | undefined;
        let receiver: string | undefined;

        if (callee?.['type'] === 'MemberExpression') {
          const obj = callee['object'] as AstAny | undefined;
          const prop = callee['property'] as AstAny | undefined;
          name = prop ? String(prop['name']) : undefined;
          receiver = obj ? String(obj['name'] ?? obj['type']) : undefined;
        } else if (callee?.['type'] === 'Identifier') {
          name = String(callee['name']);
        }

        acc.push({
          kind: 'call',
          name,
          line: node['loc']?.start.line ?? 0,
          column: node['loc']?.start.column ?? 0,
          extra: { receiver },
        });
      }
      break;

    case 'classes':
      if (node['type'] === 'ClassDeclaration' || node['type'] === 'ClassExpression') {
        const id = node['id'] as AstAny | undefined;
        acc.push({
          kind: 'class',
          name: id ? String(id['name']) : undefined,
          line: node['loc']?.start.line ?? 0,
          column: node['loc']?.start.column ?? 0,
        });
      }
      break;

    case 'exports':
      if (node['type'] === 'ExportNamedDeclaration' || node['type'] === 'ExportDefaultDeclaration') {
        acc.push({
          kind: node['type'],
          line: node['loc']?.start.line ?? 0,
          column: node['loc']?.start.column ?? 0,
        });
      }
      break;
  }

  // Recurse into child nodes.
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && 'type' in item) {
          walkNode(item as AstAny, extract, acc);
        }
      }
    } else if (child && typeof child === 'object' && 'type' in (child as object)) {
      walkNode(child as AstAny, extract, acc);
    }
  }
}

/**
 * Python AST extraction using regex-based pattern matching.
 * Covers the common import and function-call patterns in v0.1 rule packs.
 * Full tree-sitter-python integration is planned for v0.2.
 */
function parsePython(code: string, extract: ParseAstInput['extract']): ParseAstOutput {
  const lines = code.split('\n');
  const nodes: AstNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const lineNum = i + 1;

    if (extract === 'imports') {
      // import foo, import foo as bar
      const importMatch = /^import\s+([\w.]+)(?:\s+as\s+\w+)?/.exec(line);
      if (importMatch?.[1]) {
        nodes.push({ kind: 'import', name: importMatch[1], line: lineNum, column: 0 });
        continue;
      }
      // from foo import bar, baz
      const fromMatch = /^from\s+([\w.]+)\s+import\s+(.+)/.exec(line);
      if (fromMatch?.[1] && fromMatch[2]) {
        const source = fromMatch[1];
        const names = fromMatch[2].split(',').map((s) => s.trim().split(' ')[0] ?? '');
        for (const name of names) {
          nodes.push({ kind: 'import', name, line: lineNum, column: 0, extra: { source } });
        }
      }
    } else if (extract === 'functions') {
      const fnMatch = /^(?:async\s+)?def\s+(\w+)\s*\(/.exec(line);
      if (fnMatch?.[1]) {
        nodes.push({ kind: 'function', name: fnMatch[1], line: lineNum, column: 0 });
      }
    } else if (extract === 'calls') {
      const callMatches = line.matchAll(/(\w+)\.(\w+)\s*\(/g);
      for (const m of callMatches) {
        nodes.push({
          kind: 'call',
          name: m[2],
          line: lineNum,
          column: m.index ?? 0,
          extra: { receiver: m[1] },
        });
      }
    } else if (extract === 'classes') {
      const clsMatch = /^class\s+(\w+)/.exec(line);
      if (clsMatch?.[1]) {
        nodes.push({ kind: 'class', name: clsMatch[1], line: lineNum, column: 0 });
      }
    }
  }

  return { nodes, language: 'python' };
}

/** Anthropic tool definition for parse_ast. */
export const parseAstTool = {
  name: 'parse_ast' as const,
  description:
    'Parse source code and extract structural nodes: imports, function definitions, class definitions, method/function calls, or exports. Use this to understand what a file imports, what methods it calls, or what symbols it defines.',
  input_schema: {
    type: 'object' as const,
    properties: {
      code: {
        type: 'string',
        description: 'The source code to parse',
      },
      language: {
        type: 'string',
        enum: ['typescript', 'javascript', 'python'],
        description: 'The programming language of the source code',
      },
      extract: {
        type: 'string',
        enum: ['imports', 'functions', 'classes', 'calls', 'exports'],
        description: 'Which type of AST nodes to extract',
      },
    },
    required: ['code', 'language', 'extract'],
  },
};
