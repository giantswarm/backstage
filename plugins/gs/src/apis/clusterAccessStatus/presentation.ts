import { ClusterAccessState } from './types';

/**
 * How each access state is named and coloured, shared by every view of it
 * (the classic sidebar's Cluster access widget and the shell's Environments
 * section on Profile and settings), so the two never disagree.
 */
export const CLUSTER_ACCESS_STATE_LABELS: Record<ClusterAccessState, string> = {
  connecting: 'Connecting…',
  healthy: 'Healthy',
  degraded: 'Degraded',
  'session-expired': 'Session expired',
};

/** Lowercase wording for a count summary ("1 degraded · 4 healthy"). */
export const CLUSTER_ACCESS_SUMMARY_LABELS: Record<ClusterAccessState, string> =
  {
    connecting: 'connecting',
    healthy: 'healthy',
    degraded: 'degraded',
    'session-expired': 'session expired',
  };

/** What each state means, as a status tone. */
export type ClusterAccessTone = 'neutral' | 'success' | 'warning' | 'danger';

export const CLUSTER_ACCESS_STATE_TONES: Record<
  ClusterAccessState,
  ClusterAccessTone
> = {
  connecting: 'neutral',
  healthy: 'success',
  degraded: 'warning',
  'session-expired': 'danger',
};

/** Severity order, worst first: the order summaries and lists use. */
export const CLUSTER_ACCESS_STATE_ORDER: ClusterAccessState[] = [
  'session-expired',
  'degraded',
  'connecting',
  'healthy',
];

/** The label of an installation switched off app-wide, which is not probed. */
export const CLUSTER_ACCESS_OFF_LABEL = 'Off';

/** States whose probe result carries a reason worth showing. */
export function showsAccessReason(state: ClusterAccessState): boolean {
  return state === 'degraded' || state === 'session-expired';
}
