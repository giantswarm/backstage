import compareAsc from 'date-fns/fp/compareAsc';
import parseISO from 'date-fns/fp/parseISO';
import toDate from 'date-fns-tz/toDate';

export function compareDates(
  dateA: Date | string | number,
  dateB: Date | string | number,
): -1 | 0 | 1 {
  const a = toDate(dateA, { timeZone: 'UTC' });
  const b = toDate(dateB, { timeZone: 'UTC' });

  return compareAsc(b)(a) as -1 | 0 | 1;
}

export function parseDate(date: string | number | Date): Date {
  const givenDate = date instanceof Date ? date : parseISO(date);
  if (isNaN(givenDate.getTime())) {
    return new Date(date);
  }

  return givenDate;
}
