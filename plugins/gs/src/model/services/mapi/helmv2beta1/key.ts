import { IHelmRelease } from "./types";

export const labelCluster = 'giantswarm.io/cluster';

export const statusUnknown = 'unknown';
export const statusFailed = 'failed';
export const statusStalled = 'stalled';
export const statusReconciling = 'reconciling';
export const statusReconciled = 'reconciled';

export function getHelmReleaseVersion(helmRelease: IHelmRelease) {
  if (!helmRelease.status || !helmRelease.status.lastAppliedRevision) {
    return helmRelease.spec?.chart.spec.version;
  }

  return helmRelease.status.lastAppliedRevision;
}

export function getHelmReleaseStatus(helmRelease: IHelmRelease) {
  if (!helmRelease.status || !helmRelease.status.conditions) {
    return '';
  }
  const conditions = helmRelease.status?.conditions;

  if (conditions.some((c) => c.type === 'Ready' && c.status === 'False')) {
    return statusFailed;
  }

  if (conditions.some((c) => c.type === 'Stalled' && c.status === 'True')) {
    return statusStalled;
  }

  if (conditions.some((c) => c.type === 'Reconciling' && c.status === 'True')) {
    return statusReconciling
  }

  if (conditions.some((c) => c.type === 'Ready' && c.status === 'True')) {
    return statusReconciled;
  }

  return statusUnknown;
}

export function getHelmReleaseClusterName(helmRelease: IHelmRelease): string {
  return helmRelease.metadata.labels?.[labelCluster] || '';
}
