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

/**
 * Format an estimated USD amount, or `—` when there is nothing to price.
 *
 * `undefined` means **no rate could be derived** — every model in the window
 * was missing from the gateway's price catalogue — which is a different fact
 * from zero spend. Rendering it as `$0.00` would state confidently that the
 * platform is free. See `deriveTokenRates` for where that distinction is made.
 *
 * The precision follows the magnitude because these amounts span six orders:
 * a single session costs fractions of a cent while a month across a fleet runs
 * to thousands, and one fixed precision reads as either `$0.00` or
 * `$1,234.5678`.
 */
export function formatUsd(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  if (value === 0) {
    return '$0.00';
  }
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  // Not `$0.00`: a real, priced, very small amount must not read as free.
  if (abs < 0.01) {
    return `${sign}<$0.01`;
  }
  if (abs < 1) {
    return `${sign}$${abs.toFixed(3)}`;
  }
  if (abs < 100) {
    return `${sign}$${abs.toFixed(2)}`;
  }
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

/** Format a percentage, or `—`. One decimal below 10%, none above. */
export function formatPercent(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return Math.abs(value) < 10
    ? `${value.toFixed(1)}%`
    : `${Math.round(value)}%`;
}

/**
 * Format a latency in seconds, or `—`.
 *
 * `undefined` is the normal answer for an idle installation, not an error:
 * `histogram_quantile` over a histogram with no observations is `NaN`.
 */
export function formatSeconds(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  if (value < 1) {
    return `${Math.round(value * 1000)}ms`;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)}s`;
}
