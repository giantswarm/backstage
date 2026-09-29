/** Ages, formatted for the places that show them. */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

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
 * Returns undefined for an unknown or future instant: an age we cannot compute
 * is not zero, and rendering "0s" for one would claim something just happened.
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
