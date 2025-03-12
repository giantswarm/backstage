import { TableColumn } from '@backstage/core-components';
import semver from 'semver';

export function sortAndFilterOptions<T extends object>(
  fn: (item: T) => string | undefined,
) {
  return {
    customFilterAndSearch: stringCompareFilter(fn),
    customSort: stringCompareSort(fn),
  } as TableColumn<T>;
}

export function stringCompareSort<T>(fn: (item: T) => string | undefined) {
  return (a: T, b: T) => {
    return (fn(a) || '').localeCompare(fn(b) || '');
  };
}

export function stringCompareFilter<T>(fn: (item: T) => string | undefined) {
  return (query: string, item: T) => {
    return (fn(item) || '')
      .toLocaleUpperCase('en-US')
      .includes(query.toLocaleUpperCase('en-US'));
  };
}

export function semverCompareSort<T>(fn: (item: T) => string | undefined) {
  return (a: T, b: T) => {
    const versionA = semver.valid(fn(a));
    const versionB = semver.valid(fn(b));

    if (!versionA && !versionB) {
      return 0;
    }

    if (!versionA) {
      return 1;
    }

    if (!versionB) {
      return -1;
    }

    return semver.compare(versionA, versionB);
  };
}
