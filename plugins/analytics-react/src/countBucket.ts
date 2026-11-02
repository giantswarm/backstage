/**
 * How many of something there are, as a signal may carry it: one of a few
 * coarse buckets, never the number itself. Shared by every count attribute,
 * so one dashboard reads them all the same way.
 */
export const COUNT_BUCKETS = [
  '0',
  '1',
  '2-4',
  '5-9',
  '10-19',
  '20-49',
  '50-99',
  '100+',
] as const;

export type CountBucket = (typeof COUNT_BUCKETS)[number];

/**
 * The buckets and `unknown`, for a count that can fail to load: a read that
 * failed, or one still pending when the signal had to go.
 */
export const COUNT_BUCKETS_OR_UNKNOWN = [...COUNT_BUCKETS, 'unknown'] as const;

export type CountBucketOrUnknown = (typeof COUNT_BUCKETS_OR_UNKNOWN)[number];

/** The bucket a count falls in; a negative or fractional count rounds into one. */
export function countBucket(count: number): CountBucket {
  if (count < 1) {
    return '0';
  }
  if (count < 2) {
    return '1';
  }
  if (count < 5) {
    return '2-4';
  }
  if (count < 10) {
    return '5-9';
  }
  if (count < 20) {
    return '10-19';
  }
  if (count < 50) {
    return '20-49';
  }
  return count < 100 ? '50-99' : '100+';
}

/** The bucket of a count, or `unknown` for one that is not known. */
export function countBucketOrUnknown(
  count: number | undefined,
): CountBucketOrUnknown {
  return count === undefined || Number.isNaN(count)
    ? 'unknown'
    : countBucket(count);
}
