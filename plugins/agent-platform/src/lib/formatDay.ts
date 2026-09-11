/**
 * Day labels for the usage charts' axes and tooltips.
 *
 * In `lib/` rather than beside one chart because both halves of the Usage
 * tab draw a daily series — the session-derived token charts and the
 * gateway-derived cost ones — and they have to label the same day the same
 * way. Every day here is a UTC calendar day, matching the `YYYY-MM-DD` keys
 * both reducers produce.
 */

/** `2026-09-04` as `4 Sep`, matching muster's daily axis. */
export function formatDayTick(day: string): string {
  const at = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(at)) {
    return day;
  }
  return new Date(at).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** `2026-09-04` as `Fri, 4 Sep 2026` for the tooltip heading. */
export function formatDayTooltip(day: string): string {
  const at = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(at)) {
    return day;
  }
  return new Date(at).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
