import type { RulePack } from '@hallux/shared';
import { fabricatedMethodsPrompt } from '@hallux/engine/prompts';

/**
 * Rule pack: fabricated-methods
 *
 * Detects calls to methods that don't exist on the receiver type. AI models frequently call
 * plausible-sounding methods that don't exist on JavaScript built-in types (Array, String,
 * Object, Promise) or on common framework types (React hooks, etc.).
 */
export const fabricatedMethodsRulePack: RulePack = {
  name: 'fabricated-methods',
  severity: 'critical',
  systemPrompt: fabricatedMethodsPrompt,
  allowedTools: ['read_file', 'parse_ast', 'search_code'],
};
