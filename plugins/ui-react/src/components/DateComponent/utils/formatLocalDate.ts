import { parseDate } from './parseDate';

function formatLocal(
  date: string | Date,
  options: Intl.DateTimeFormatOptions,
): string {
  const parsed = parseDate(date);
  if (!isFinite(parsed.getTime())) return date.toString();
  return new Intl.DateTimeFormat(undefined, options).format(parsed);
}
/** A local timestamp in the browser's date order and clock convention. */
export function formatLocalDate(date: string | Date): string {
  return formatLocal(date, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
/** An exact local timestamp, including seconds and time zone. */
export function formatLocalDateFull(date: string | Date): string {
  return formatLocal(date, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}
/** A local clock time whose date is supplied by its surrounding context. */
export function formatLocalTime(date: string | Date): string {
  return formatLocal(date, { hour: '2-digit', minute: '2-digit' });
}
/** A local clock precise enough to distinguish successive removal passes. */
export function formatLocalTimeWithSeconds(date: string | Date): string {
  return formatLocal(date, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
/** A local calendar day, including the year when it differs from currentYear. */
export function formatLocalDay(
  date: string | Date,
  currentYear = new Date().getFullYear(),
): string {
  return formatLocal(date, {
    day: 'numeric',
    month: 'short',
    ...(parseDate(date).getFullYear() === currentYear
      ? {}
      : { year: 'numeric' }),
  });
}
