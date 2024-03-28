import compareAsc from 'date-fns/fp/compareAsc';
import format from 'date-fns/fp/format';
import formatDistance from 'date-fns/fp/formatDistance';
import parseISO from 'date-fns/fp/parseISO';
import toDate from 'date-fns-tz/toDate';
import utcToZonedTime from 'date-fns-tz/utcToZonedTime';

/**
 * Format a date into a pretty way.
 * @param date
 */
export function formatDate(date: string | number | Date): string {
  const givenDate = parseDate(date);

  if (!isFinite(givenDate.getTime())) return date.toString();

  const parsedDate = utcToZonedTime(givenDate, 'UTC');

  return `${format('d MMM yyyy, HH:mm')(parsedDate)} UTC`;
}

/**
 * Get a formatted date structure, relative to now (e.g. 2 days ago, or 1 year ago).
 * @param date
 */
export function getRelativeDateFromNow(date: string | number | Date): string {
  return getRelativeDate(date, new Date());
}

/**
 * Get a formatted date structure, relative to other date (e.g. 2 days ago, or 1 year ago).
 * @param dateA
 * @param dateB
 */
export function getRelativeDate(
  dateA: string | number | Date,
  dateB: string | number | Date,
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

export function compareDates(
  dateA: Date | string | number,
  dateB: Date | string | number,
): -1 | 0 | 1 {
  const a = toDate(dateA, { timeZone: 'UTC' });
  const b = toDate(dateB, { timeZone: 'UTC' });

  return compareAsc(b)(a) as -1 | 0 | 1;
}

/**
 * Convert a string to title case (e.g. `A Title Cased Example`).
 * @param str
 * @source http://stackoverflow.com/questions/196972/convert-string-to-title-case-with-javascript
 */
export function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, txt => {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

/**
 * Convert a string to sentence case (e.g. `A sentence cased example`).
 * @param str
 * @source https://javascriptf1.com/snippet/convert-a-string-to-sentence-case-in-javascript
 */
export function toSentenceCase(str: string): string {
  return str.toLowerCase().charAt(0).toUpperCase() + str.slice(1);
}

export function parseDate(date: string | number | Date): Date {
  const givenDate = date instanceof Date ? date : parseISO(date);
  if (isNaN(givenDate.getTime())) {
    return new Date(date);
  }

  return givenDate;
}

export function getReleaseNotesURL(
  sourceLocation: string,
  version: string,
): string {
  return `${sourceLocation}/releases/tag/v${version}`;
}

export function getCommitURL(
  sourceLocation: string,
  commitHash: string,
): string {
  return `${sourceLocation}/commit/${commitHash}`;
}

export function formatVersion(version: string) {
  // Remove the `v` prefix if it's present.
  return version.startsWith('v') ? version.slice(1) : version;
}

export function formatAppCatalogName(name: string) {
  return name.endsWith('-catalog') ? name : `${name}-catalog`;
}
