import { registerRulePack } from '@hallux/engine';
import { hallucinatedImportsRulePack } from './hallucinated-imports/index.js';
import { phantomTestsRulePack } from './phantom-tests/index.js';
import { fabricatedMethodsRulePack } from './fabricated-methods/index.js';

// Register all rule packs with the engine at module load time.
registerRulePack(hallucinatedImportsRulePack);
registerRulePack(phantomTestsRulePack);
registerRulePack(fabricatedMethodsRulePack);

export { hallucinatedImportsRulePack } from './hallucinated-imports/index.js';
export { phantomTestsRulePack } from './phantom-tests/index.js';
export { fabricatedMethodsRulePack } from './fabricated-methods/index.js';

/** All v0.1 rule packs, in evaluation order. */
export const ALL_RULE_PACKS = [
  hallucinatedImportsRulePack,
  phantomTestsRulePack,
  fabricatedMethodsRulePack,
] as const;
