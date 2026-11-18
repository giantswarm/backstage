import { MimirMetricSample, MimirQueryResponse } from '../../apis/mimir/types';

export function samplesOf(
  response: MimirQueryResponse | undefined,
): MimirMetricSample[] {
  return response?.data?.result ?? [];
}

/**
 * The samples of an optional query, or `undefined` when it failed and has no
 * earlier result. A failed background refetch keeps the last good samples, so
 * a single Mimir hiccup doesn't flip everything to "not available".
 */
export function optionalSamplesOf(
  data: MimirQueryResponse | undefined,
  error: unknown,
): MimirMetricSample[] | undefined {
  if (data) return samplesOf(data);
  return error ? undefined : [];
}

/**
 * The error of a required query, but only while it has no result yet. After a
 * first success, a failed refetch keeps showing the last good result.
 */
export function blockingError(query: {
  data: unknown;
  error: unknown;
}): unknown {
  return query.data ? undefined : (query.error ?? undefined);
}
