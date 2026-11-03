/**
 * Number and duration formatting shared by the Agent Platform's plugins: the agent-platform
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

const MINUTE = 60;
const HOUR = 60 * MINUTE;

/**
 * Format a duration in seconds, or `—`: the one duration format of the Agent
 * Platform, for a latency, a run, a step or how long something has been going.
 *
 * - below a second in whole milliseconds: `420 ms`
 * - below 10 s with one decimal: `1.2 s`
 * - then whole seconds up to a minute: `18 s`
 * - then minutes and seconds up to an hour: `2 min 30 s`, `12 min`
 * - then hours and minutes: `1 h 5 min`
 *
 * Whole units only from 10 s on: a decimal there is noise. Each tier is picked
 * after rounding, so 999.6 ms reads `1.0 s`, 9.96 s `10 s` and 59.6 s `1 min`.
 * Below an hour the seconds are rounded; above it the leftover seconds are
 * dropped rather than rounded into a minute. A space before every unit.
 *
 * Milliseconds go in as `ms / 1000`. A negative span (a clock skew) reads as
 * zero. `undefined`, `null` or `NaN` is the normal answer for an idle
 * installation, not an error: `histogram_quantile` over a histogram with no
 * observations is `NaN`.
 */
export function formatSeconds(value: number | null | undefined): string {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return '—';
  }
  const seconds = Math.max(0, value);
  const ms = Math.round(seconds * 1000);
  if (ms < 1000) {
    return `${ms} ms`;
  }
  const tenths = Math.round(seconds * 10);
  if (tenths < 100) {
    return `${(tenths / 10).toFixed(1)} s`;
  }
  const total = Math.round(seconds);
  if (total < MINUTE) {
    return `${total} s`;
  }
  if (total < HOUR) {
    const minutes = Math.floor(total / MINUTE);
    const rest = total % MINUTE;
    return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
  }
  const hours = Math.floor(total / HOUR);
  const minutes = Math.floor((total % HOUR) / MINUTE);
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
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
  const digitsFor = (figure: number, at: number) =>
    at === 0 || figure >= 100 ? 0 : 1;
  // The unit is settled after rounding: 1,048,575 bytes is 1023.999 KiB,
  // which rounds to "1024 KiB" — a whole MiB.
  if (
    unit < BYTE_UNITS.length - 1 &&
    Number(value.toFixed(digitsFor(value, unit))) >= 1024
  ) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(digitsFor(value, unit))} ${BYTE_UNITS[unit]}`;
}
