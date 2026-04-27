/**
 * Severity ordering — higher index = lower severity.
 */
export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
/**
 * Returns true if `a` is at least as severe as `b`.
 */
export function isAtLeastSeverity(a, b) {
    return SEVERITY_ORDER.indexOf(a) <= SEVERITY_ORDER.indexOf(b);
}
//# sourceMappingURL=types.js.map