import { toZonedTime } from 'date-fns-tz';
import { format } from 'date-fns/fp/format';
import { parseDate } from './parseDate';

/**
 * Format a date into a pretty way.
 * @param date
 */
export function formatDate(date: string | Date): string {
  const givenDate = parseDate(date);

  if (!isFinite(givenDate.getTime())) return date.toString();

  const parsedDate = toZonedTime(givenDate, 'UTC');

  return `${format('d MMM yyyy, HH:mm')(parsedDate)} UTC`;
}
