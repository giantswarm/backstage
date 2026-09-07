/**
 * Number formatting for the Agent Platform's own quantities.
 *
 * Domain formatters rather than UI primitives — tokens and call counts, not
 * generic display — which is why they live here and not in `ui-react`.
 */

/** Format a token count compactly (`1.5k`, `1.2M`). */
export function formatTokens(total: number): string {
  if (total < 1000) {
    return String(total);
  }
  if (total < 1_000_000) {
    return `${(total / 1000).toFixed(1)}k`;
  }
  return `${(total / 1_000_000).toFixed(1)}M`;
}

/**
 * Format a plain count with thousands separators.
 *
 * Not compacted the way tokens are: a turn or tool-call count is small enough
 * to read exactly, and rounding "1,040 calls" to "1.0k" would lose a figure
 * someone might reconcile against a list.
 */
export function formatCount(value: number): string {
  return Math.round(value).toLocaleString();
}
