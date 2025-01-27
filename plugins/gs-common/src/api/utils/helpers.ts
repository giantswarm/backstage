import { compareAsc } from 'date-fns/fp/compareAsc';
import { parseISO } from 'date-fns/fp/parseISO';
import { formatDistance } from 'date-fns/fp/formatDistance';
import { toDate } from 'date-fns-tz';
import { InstallationObjectRef, Resource, ResourceObject } from '../types';

/**
 * Get a formatted date structure, relative to now (e.g. 2 days ago, or 1 year ago).
 * @param date
 */
export function getRelativeDateFromNow(date: string | Date): string {
  return getRelativeDate(date, new Date());
}

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

export function compareDates(
  dateA: string | Date,
  dateB: string | Date,
): -1 | 0 | 1 {
  const a = toDate(dateA, { timeZone: 'UTC' });
  const b = toDate(dateB, { timeZone: 'UTC' });

  return compareAsc(b)(a) as -1 | 0 | 1;
}

export function parseDate(date: string | Date): Date {
  const givenDate = date instanceof Date ? date : parseISO(date);
  if (isNaN(givenDate.getTime())) {
    return new Date(date);
  }

  return givenDate;
}

export function getApiGroupFromApiVersion(apiVersion: string): string {
  return apiVersion.split('/')[0];
}

export function findResourceByRef<T extends ResourceObject>(
  resources: Resource<T>[],
  ref: InstallationObjectRef,
) {
  const { installationName, apiVersion, kind, name, namespace } = ref;
  const r = resources.find(resource => {
    const installationNameMatch =
      resource.installationName === installationName;
    const apiVersionMatch = apiVersion
      ? resource.apiVersion === apiVersion
      : true;
    const kindMatch = resource.kind === kind;
    const nameMatch = resource.metadata.name === name;
    const namespaceMatch = namespace
      ? resource.metadata.namespace === namespace
      : true;

    return (
      installationNameMatch &&
      apiVersionMatch &&
      kindMatch &&
      nameMatch &&
      namespaceMatch
    );
  });

  return r;
}
