import { TableColumn } from '@backstage/core-components';
import { Version } from '@giantswarm/semver-ts';

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

/**
 * Returns a comparator that sorts items by the version `fn` reads from them,
 * oldest first or, with `descending`, newest first. Items without a version
 * sort last either way.
 */
export function semverCompareSort<T>(
  fn: (item: T) => string | undefined,
  options: { descending?: boolean } = {},
) {
  const direction = options.descending ? -1 : 1;
  // A sort compares each value many times; parse each one once.
  const parsed = new Map<string, Version | null>();
  const parse = (value: string | undefined): Version | null => {
    if (!value) {
      return null;
    }
    let version = parsed.get(value);
    if (version === undefined) {
      version = Version.tryParse(value);
      parsed.set(value, version);
    }
    return version;
  };

  return (a: T, b: T) => {
    const versionA = parse(fn(a));
    const versionB = parse(fn(b));

    if (!versionA && !versionB) {
      return 0;
    }

    if (!versionA) {
      return 1;
    }

    if (!versionB) {
      return -1;
    }

    return direction * versionA.compare(versionB);
  };
}

/**
 * Returns a comparator that sorts items by the number `fn` reads from them,
 * smallest first. Items without a number sort last in both directions:
 * material-table sorts descending by calling the comparator with its first
 * two arguments swapped and `'desc'` as the fourth.
 */
export function numberCompareSort<T>(fn: (item: T) => number | undefined) {
  return (a: T, b: T, _type?: string, direction?: string) => {
    const numberA = fn(a);
    const numberB = fn(b);
    const missingLast = direction === 'desc' ? -1 : 1;

    if (numberA === undefined && numberB === undefined) {
      return 0;
    }

    if (numberA === undefined) {
      return missingLast;
    }

    if (numberB === undefined) {
      return -missingLast;
    }

    return numberA - numberB;
  };
}
