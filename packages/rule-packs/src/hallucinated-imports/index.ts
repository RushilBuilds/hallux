import type { RulePack } from '@hallux/shared';
import { hallucinatedImportsPrompt } from '@hallux/engine/prompts';

/**
 * Rule pack: hallucinated-imports
 *
 * Detects imports of packages or named exports that don't exist on npm or PyPI.
 * This is one of the most common failure modes of AI-generated code — models confidently
 * import packages they've hallucinated or named exports that don't exist in real packages.
 */
export const hallucinatedImportsRulePack: RulePack = {
  name: 'hallucinated-imports',
  severity: 'critical',
  systemPrompt: hallucinatedImportsPrompt,
  allowedTools: ['read_file', 'search_code', 'check_registry', 'parse_ast'],
};
