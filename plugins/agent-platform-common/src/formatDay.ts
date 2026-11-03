/**
 * Day labels for the Usage screen: the charts' axes and tooltips, and the
 * data-start notes.
 *
 * In the common package because both plugins on that screen label days — the
 * agent-platform charts and the muster plugin's Connectors section — and they
 * have to label the same day the same way. Every day here is a UTC calendar
 * day, matching the `YYYY-MM-DD` keys the usage reducers produce.
 */

/** A `YYYY-MM-DD` day in the browser's locale, or the input if it is not one. */
function formatDay(day: string, options: Intl.DateTimeFormatOptions): string {
  const at = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(at)) {
    return day;
  }
  return new Date(at).toLocaleDateString(undefined, {
    ...options,
    timeZone: 'UTC',
  });
}

/** `2026-09-04` as `4 Sep`, matching muster's daily axis. */
export function formatDayTick(day: string): string {
  return formatDay(day, { day: 'numeric', month: 'short' });
}

/** `2026-09-04` as `Fri, 4 Sep 2026` for the tooltip heading. */
export function formatDayTooltip(day: string): string {
  return formatDay(day, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** `2026-09-04` as `4 Sep 2026`, for a day named in prose. */
export function formatDayWithYear(day: string): string {
  return formatDay(day, { day: 'numeric', month: 'short', year: 'numeric' });
}
