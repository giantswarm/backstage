import { format } from 'date-fns/fp/format';
import { parseDate } from './parseDate';

/**
 * The browser's short name for its time zone at `date`, e.g. "CEST" or
 * "GMT+2" (the locale decides which), or `undefined` where the runtime cannot
 * say.
 */
function localZoneName(date: Date): string | undefined {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
      .formatToParts(date)
      .find(part => part.type === 'timeZoneName')?.value;
  } catch {
    return undefined;
  }
}

/**
 * `date` in the browser's time zone, in date-fns `pattern`; a value that does
 * not parse comes back as given.
 */
function formatLocal(date: string | Date, pattern: string): string {
  const givenDate = parseDate(date);
  if (!isFinite(givenDate.getTime())) return date.toString();
  return format(pattern)(givenDate);
}

/**
 * A date in the browser's time zone, in {@link formatDate}'s shape without
 * the zone: `11 Oct 2026, 17:50`. For a surface where every time is local, so
 * the zone goes without saying (see `DateTimeZoneProvider`).
 */
export function formatLocalDate(date: string | Date): string {
  return formatLocal(date, 'd MMM yyyy, HH:mm');
}

/**
 * The full local timestamp, seconds and zone included:
 * `11 Oct 2026, 17:50:12 CEST`. What a hover shows beside
 * {@link formatLocalDate}, so the exact moment and its clock stay one hover
 * away.
 */
export function formatLocalDateFull(date: string | Date): string {
  const givenDate = parseDate(date);
  if (!isFinite(givenDate.getTime())) return date.toString();
  const zone = localZoneName(givenDate);
  const stamp = format('d MMM yyyy, HH:mm:ss')(givenDate);
  return zone ? `${stamp} ${zone}` : stamp;
}

/**
 * The local time of day in {@link formatLocalDate}'s clock: `17:50`. For a
 * compact list cell whose date goes without saying.
 */
export function formatLocalTime(date: string | Date): string {
  return formatLocal(date, 'HH:mm');
}

/**
 * The local day in {@link formatLocalDate}'s words: `11 Oct`, with the year
 * (`11 Oct 2025`) only when it is not `currentYear`. For a compact list cell.
 */
export function formatLocalDay(
  date: string | Date,
  currentYear: number = new Date().getFullYear(),
): string {
  return formatLocal(
    date,
    parseDate(date).getFullYear() === currentYear ? 'd MMM' : 'd MMM yyyy',
  );
}
