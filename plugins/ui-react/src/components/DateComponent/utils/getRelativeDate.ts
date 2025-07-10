import { compareAsc } from 'date-fns/fp/compareAsc';
import { formatDistance } from 'date-fns/fp/formatDistance';
import { parseDate } from './parseDate';

/**
 * Get a formatted date structure, relative to other date (e.g. 2 days ago, or 1 year ago).
 * @param dateA
 * @param dateB
 */
export function getRelativeDate(
  dateA: string | Date,
  dateB: string | Date,
): string {
  const baseDate = parseDate(dateA);
  const date = parseDate(dateB);
  let distance = formatDistance(date)(baseDate);

  if (compareAsc(date)(baseDate) < 0) {
    distance += ' ago';
  } else {
    distance = `in ${distance}`;
  }

  return distance;
}
