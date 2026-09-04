/**
 * Durations and ages, formatted for the places that show them.
 *
 * Two callers with genuinely different needs, which is why there are two
 * functions rather than one with a flag: the session stats strip wants a span
 * between two timestamps at readable precision, and the switcher rail wants a
 * single-unit age in a 280px column.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * How long a session spanned, from its first to its last activity.
 *
 * **Wall-clock, not compute time.** kagent records no per-turn durations, so this
 * is `updated_at − created_at`: it includes however long the user was away between
 * turns. A session answered in seconds and returned to the next day reads as a day
 * — which is the truth about the session, just not about the agent's effort.
 *
 * Returns undefined when either end is unknown, or when the span is negative
 * (clock skew between the writer and us) rather than rendering something absurd.
 */
export function formatDuration(
  from: string | undefined,
  to: string | undefined,
): string | undefined {
  if (!from || !to) {
    return undefined;
  }
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return undefined;
  }
  const ms = end - start;
  if (ms < 0) {
    return undefined;
  }
  // Sub-minute spans are real — a one-shot question answered immediately — so
  // seconds are worth showing rather than rounding to "0m".
  if (ms < MINUTE_MS) {
    return `${Math.round(ms / 1000)}s`;
  }
  if (ms < HOUR_MS) {
    return `${Math.floor(ms / MINUTE_MS)}m`;
  }
  if (ms < DAY_MS) {
    const hours = Math.floor(ms / HOUR_MS);
    const minutes = Math.floor((ms % HOUR_MS) / MINUTE_MS);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

/**
 * How long ago something happened, in one unit.
 *
 * `42s` / `16m` / `2h` / `3d` — never `2h 5m`. The rail shows this on a card
 * three lines tall next to a title that matters more, so a second unit costs
 * width to add precision nobody reads at a glance.
 *
 * Takes epoch milliseconds rather than an ISO string because its input is a
 * state's `changedAt`, which arrives already parsed.
 *
 * Returns undefined for an unknown or future instant, the same discipline
 * {@link formatDuration} keeps: an age we cannot compute is not zero, and
 * rendering "0s" for one would claim something just happened.
 */
export function formatCompactAge(
  sinceEpochMs: number | undefined,
  now: number,
): string | undefined {
  if (sinceEpochMs === undefined || Number.isNaN(sinceEpochMs)) {
    return undefined;
  }
  const ms = now - sinceEpochMs;
  if (ms < 0) {
    return undefined;
  }
  if (ms < MINUTE_MS) {
    return `${Math.round(ms / 1000)}s`;
  }
  if (ms < HOUR_MS) {
    return `${Math.floor(ms / MINUTE_MS)}m`;
  }
  if (ms < DAY_MS) {
    return `${Math.floor(ms / HOUR_MS)}h`;
  }
  return `${Math.floor(ms / DAY_MS)}d`;
}
