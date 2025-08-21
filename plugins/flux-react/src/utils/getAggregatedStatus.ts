import { FluxResourceStatus } from '@giantswarm/backstage-plugin-kubernetes-react';

export type AggregatedStatus = 'ready' | 'not-ready' | 'inactive' | 'unknown';

export function getAggregatedStatus(
  status: FluxResourceStatus,
): AggregatedStatus {
  if (status.isSuspended || status.isDependencyNotReady) {
    return 'inactive';
  } else if (status.readyStatus === 'True') {
    return 'ready';
  } else if (status.readyStatus === 'False') {
    return 'not-ready';
  }

  return 'unknown';
}
