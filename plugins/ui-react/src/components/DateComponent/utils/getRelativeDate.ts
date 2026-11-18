import { compareAsc } from 'date-fns/fp/compareAsc';
import { formatDistance } from 'date-fns/fp/formatDistance';
import { parseDate } from './parseDate';

/**
 * Get a formatted date structure, relative to other date (e.g. 2 days ago, or 1 year ago).
 *
 * A value that does not parse comes back as given, as {@link formatDate} and
 * `formatLocalDate` return it, instead of date-fns' `RangeError`: one odd
 * timestamp shows as itself rather than taking down the page around it.
 * @param dateA
 * @param dateB
 */
export function getRelativeDate(
  dateA: string | Date,
  dateB: string | Date,
): string {
  const baseDate = parseDate(dateA);
  const date = parseDate(dateB);
  if (!isFinite(baseDate.getTime()) || !isFinite(date.getTime())) {
    return dateA.toString();
  }
  let distance = formatDistance(date)(baseDate);

  if (compareAsc(date)(baseDate) < 0) {
    distance += ' ago';
  } else {
    distance = `in ${distance}`;
  }

  return distance;
}
