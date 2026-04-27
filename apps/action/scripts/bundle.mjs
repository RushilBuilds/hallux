/**
 * Bundles the compiled Action entry point into a single file for GitHub Actions.
 * GitHub Actions run Node directly — no npm install in the runner for actions using node20 runtime.
 * esbuild bundles all dependencies into dist/index.js.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [path.join(__dirname, '../dist/index.js')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: path.join(__dirname, '../dist/index.js'),
  format: 'esm',
  allowOverwrite: true,
  external: [
    // Node built-ins are available in the runner.
    'node:*',
    'fs',
    'path',
    'child_process',
    'util',
    'url',
    'stream',
    'events',
    'os',
    'crypto',
  ],
  banner: {
    js: '// Hallux v0.1 — bundled for GitHub Actions\n',
  },
});

console.log('Bundle complete: dist/index.js');
