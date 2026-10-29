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
 * A date in the browser's time zone, in {@link formatDate}'s shape without
 * the zone: `11 Oct 2026, 17:50`. For a surface where every time is local, so
 * the zone goes without saying (see `DateTimeZoneProvider`).
 */
export function formatLocalDate(date: string | Date): string {
  const givenDate = parseDate(date);
  if (!isFinite(givenDate.getTime())) return date.toString();
  return format('d MMM yyyy, HH:mm')(givenDate);
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
