import { isMimirUnavailableReason } from '@giantswarm/backstage-plugin-gs-common';

/** What a person reads about a failed metrics read. */
export type MimirFailureDescription = {
  /** The headline, for an alert's title. */
  title: string;
  /** What it means, for an alert's description. */
  description: string;
  /** Both as running text, for where only a line fits. */
  sentence: string;
};

/**
 * The words for a Mimir that has no healthy store-gateway: it serves the last
 * few hours from its ingesters, but nothing older, until a store-gateway is
 * back.
 */
const OLDER_DATA_TITLE = 'Older data is temporarily unavailable';
const OLDER_DATA_DESCRIPTION =
  'The metrics store cannot read data older than a few hours right now, so figures that need it cannot be shown. This usually resolves within a few minutes.';

export const OLDER_METRICS_UNAVAILABLE: MimirFailureDescription = {
  title: OLDER_DATA_TITLE,
  description: OLDER_DATA_DESCRIPTION,
  sentence: `${OLDER_DATA_TITLE}. ${OLDER_DATA_DESCRIPTION}`,
};

/**
 * The words for a failed Mimir read when the backend said why (the `reason`
 * of the gs backend's 503, which `MimirQueryError` carries), or undefined
 * when it did not and the caller's own generic text applies.
 *
 * Every place that shows a Mimir failure asks this first, so the same cause
 * reads the same everywhere.
 */
export function describeMimirFailure(
  error: unknown,
): MimirFailureDescription | undefined {
  const reason =
    typeof error === 'object' && error !== null
      ? (error as { reason?: unknown }).reason
      : undefined;
  if (!isMimirUnavailableReason(reason)) {
    return undefined;
  }
  switch (reason) {
    case 'older_data_unavailable':
      return OLDER_METRICS_UNAVAILABLE;
    default:
      return undefined;
  }
}

/**
 * The error to describe when several Mimir queries behind one figure failed:
 * the first that `describeMimirFailure` has words for, so the wording does not
 * depend on which query failed first, or else the first failure at all.
 */
export function pickMimirError<T>(
  ...errors: (T | null | undefined)[]
): T | null {
  const failed = errors.filter((error): error is T => Boolean(error));
  return failed.find(error => describeMimirFailure(error)) ?? failed[0] ?? null;
}
