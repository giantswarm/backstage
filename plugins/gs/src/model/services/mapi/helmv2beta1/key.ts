import { compareDates } from "../../../../components/utils/helpers";
import { IHelmRelease } from "./types";

export const labelCluster = 'giantswarm.io/cluster';

export const HelmReleaseStatuses = {
  'Unknown': 'unknown',
  'Failed': 'failed',
  'Stalled': 'stalled',
  'Reconciling': 'reconciling',
  'Reconciled': 'reconciled',
} as const;

export function getHelmReleaseLastAppliedRevision(helmRelease: IHelmRelease) {
  return helmRelease.status?.lastAppliedRevision;
}

export function getHelmReleaseLastAttemptedRevision(helmRelease: IHelmRelease) {
  return helmRelease.status?.lastAttemptedRevision;
}

export function getHelmReleaseVersion(helmRelease: IHelmRelease) {
  if (!helmRelease.status || !helmRelease.status.lastAppliedRevision) {
    return helmRelease.spec?.chart.spec.version;
  }

  return helmRelease.status.lastAppliedRevision;
}

export function getHelmReleaseStatus(helmRelease: IHelmRelease) {
  if (!helmRelease.status || !helmRelease.status.conditions) {
    return undefined;
  }
  const conditions = helmRelease.status?.conditions;

  if (conditions.some((c) => c.type === 'Ready' && c.status === 'False')) {
    return HelmReleaseStatuses.Failed;
  }

  if (conditions.some((c) => c.type === 'Stalled' && c.status === 'True')) {
    return HelmReleaseStatuses.Stalled;
  }

  if (conditions.some((c) => c.type === 'Reconciling' && c.status === 'True')) {
    return HelmReleaseStatuses.Reconciling
  }

  if (conditions.some((c) => c.type === 'Ready' && c.status === 'True')) {
    return HelmReleaseStatuses.Reconciled;
  }

  return HelmReleaseStatuses.Unknown;
}

export function getHelmReleaseClusterName(helmRelease: IHelmRelease) {
  return helmRelease.metadata.labels?.[labelCluster];
}

export function getHelmReleaseChartName(helmRelease: IHelmRelease) {
  return helmRelease.spec?.chart.spec.chart;
}

export function getHelmReleaseCreatedTimestamp(helmRelease: IHelmRelease): string | undefined {
  return helmRelease.metadata.creationTimestamp;
}

export function getHelmReleaseUpdatedTimestamp(helmRelease: IHelmRelease): string | undefined {
  const conditions = helmRelease.status?.conditions?.sort(
    (a, b) => compareDates(b.lastTransitionTime, a.lastTransitionTime)
  );

  return (conditions?.find(condition => condition.type === 'Ready') || {}).lastTransitionTime;
}

export function getHelmReleaseSourceName(helmRelease: IHelmRelease): string | undefined {
  return helmRelease.spec?.chart.spec.sourceRef?.name;
}
