import { isMimirUnavailableReason } from '@giantswarm/backstage-plugin-gs-common';

/** What a person reads about a failed metrics read: a title and a sentence. */
export type MimirFailureDescription = {
  title: string;
  description: string;
};

/**
 * The words for a Mimir that has no healthy store-gateway: it serves the last
 * few hours from its ingesters, but nothing older, until a store-gateway is
 * back.
 */
export const OLDER_METRICS_UNAVAILABLE: MimirFailureDescription = {
  title: 'Older data is temporarily unavailable',
  description:
    'The metrics store cannot read data older than a few hours right now, so figures that need it cannot be shown. This usually resolves within a few minutes.',
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
