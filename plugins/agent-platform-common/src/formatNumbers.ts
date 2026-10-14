/**
 * Number formatting shared by the Agent Platform's plugins: the agent-platform
 * plugin and muster put counts, latencies and sizes side by side on one page
 * (Usage), so they format them through one implementation. Here rather than in
 * either plugin because muster must not depend on agent-platform; here rather
 * than in `ui-react` because these are the platform's own quantities, not
 * generic display.
 *
 * **One fixed presentation, `en-US`, whatever the browser's locale**: the
 * decimal mark is fixed by `toFixed`, so the thousands grouping is fixed to
 * match (a German browser would otherwise render `1.235` next to `4.50`).
 */

/** Thousands grouping (`1,040`), the same on every machine. */
export const groupedNumberFormat = new Intl.NumberFormat('en-US');

/**
 * Format a plain count with thousands separators.
 *
 * Not compacted the way tokens are: a call count is small enough to read
 * exactly, and rounding "1,040 calls" to "1.0k" would lose a figure someone
 * might reconcile against a list.
 */
export function formatCount(value: number): string {
  return groupedNumberFormat.format(Math.round(value));
}

/**
 * Format a latency in seconds, or `—`. A space before the unit, as every
 * other duration on the platform has ("1.2 s", "420 ms").
 *
 * `undefined` or `null` is the normal answer for an idle installation, not an
 * error: `histogram_quantile` over a histogram with no observations is `NaN`.
 */
export function formatSeconds(value: number | null | undefined): string {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return '—';
  }
  // Rounded first, so 999.6 ms reads as the second it rounds to.
  const ms = Math.round(value * 1000);
  if (ms < 1000) {
    return `${ms} ms`;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} s`;
}

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];

/** Bytes → a short binary-prefixed figure: 6594474711 → "6.1 GiB". */
export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // Whole bytes are exact; above that one decimal until the figure has three
  // digits, where a decimal is noise ("498 MiB", "6.1 GiB").
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${BYTE_UNITS[unit]}`;
}
