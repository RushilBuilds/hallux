import type { RulePack } from '@hallux/shared';
import { phantomTestsPrompt } from '@hallux/engine/prompts';

/**
 * Rule pack: phantom-tests
 *
 * Detects tests that provide no real verification: zero-assertion tests, mock-only tests,
 * and smoke tests that never check return values. AI models frequently generate test code
 * that looks legitimate but makes no assertions about actual behavior.
 */
export const phantomTestsRulePack: RulePack = {
  name: 'phantom-tests',
  severity: 'high',
  systemPrompt: phantomTestsPrompt,
  allowedTools: ['read_file', 'parse_ast', 'search_code'],
};
