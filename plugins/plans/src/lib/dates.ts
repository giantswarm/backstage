/**
 * Locale-formatted date ("Jul 8, 2026"), optionally with time, for comment
 * and pull-request timestamps. Undefined for missing or unparsable input.
 */
export function formatDate(
  value: string | undefined,
  options: { time?: boolean } = {},
): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return undefined;
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(options.time && { hour: '2-digit', minute: '2-digit' }),
  });
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/**
 * "5 hours ago", "3 days ago": for a line of plain text where a
 * `DateComponent` cannot go (a list row's description). Undefined for
 * missing or unparsable input.
 */
export function relativeTime(
  value: string | undefined,
  now: number = Date.now(),
): string | undefined {
  const time = value ? new Date(value).getTime() : NaN;
  if (isNaN(time)) {
    return undefined;
  }
  const elapsed = time - now;
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(elapsed) >= ms || unit === 'minute') {
      return format.format(Math.round(elapsed / ms), unit);
    }
  }
  return undefined;
}
