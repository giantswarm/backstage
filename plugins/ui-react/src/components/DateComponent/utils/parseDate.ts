import { parseISO } from 'date-fns/fp/parseISO';

export function parseDate(date: string | Date): Date {
  const givenDate = date instanceof Date ? date : parseISO(date);
  if (isNaN(givenDate.getTime())) {
    return new Date(date);
  }

  return givenDate;
}
