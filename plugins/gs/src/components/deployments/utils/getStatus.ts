import {
  App,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';

function getAppStatus(app: App) {
  const status = app.getStatus();

  return status?.release.status;
}

export const HelmReleaseStatuses = {
  Unknown: 'unknown',
  Failed: 'failed',
  Stalled: 'stalled',
  Reconciling: 'reconciling',
  Reconciled: 'reconciled',
} as const;

function getHelmReleaseStatus(helmRelease: HelmRelease) {
  const conditions = helmRelease.getStatusConditions();
  if (!conditions) {
    return undefined;
  }

  if (conditions.some(c => c.type === 'Ready' && c.status === 'False')) {
    return HelmReleaseStatuses.Failed;
  }

  if (conditions.some(c => c.type === 'Stalled' && c.status === 'True')) {
    return HelmReleaseStatuses.Stalled;
  }

  if (conditions.some(c => c.type === 'Reconciling' && c.status === 'True')) {
    return HelmReleaseStatuses.Reconciling;
  }

  if (conditions.some(c => c.type === 'Ready' && c.status === 'True')) {
    return HelmReleaseStatuses.Reconciled;
  }

  return HelmReleaseStatuses.Unknown;
}

function getStatus(deployment: App | HelmRelease) {
  if (deployment instanceof App) {
    return getAppStatus(deployment);
  }

  if (deployment instanceof HelmRelease) {
    return getHelmReleaseStatus(deployment);
  }

  return undefined;
}

export function getAggregatedStatus(deployment: App | HelmRelease) {
  const status = getStatus(deployment);

  if (!status) {
    return undefined;
  }

  const successfulStatuses = ['reconciled', 'deployed'];

  const pendingStatuses = [
    'reconciling',
    'pending-install',
    'pending-upgrade',
    'pending-rollback',
    'uninstalling',
  ];

  if (successfulStatuses.includes(status)) {
    return 'successful';
  }

  if (pendingStatuses.includes(status)) {
    return 'pending';
  }

  return 'failed';
}
