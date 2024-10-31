import { Labels } from '../constants';
import type { HelmRelease } from '../types';
import { compareDates } from './helpers';
import * as fluxcd from '../../model/fluxcd';

export function getHelmReleaseNames() {
  return fluxcd.HelmReleaseNames;
}

export function getHelmReleaseGVK(apiVersion?: string) {
  const gvk = fluxcd.getHelmReleaseGVK(apiVersion);
  const kind = fluxcd.HelmReleaseKind;

  if (!gvk) {
    throw new Error(
      `${apiVersion} API version is not supported for ${kind} resource.`,
    );
  }

  return gvk;
}

export const HelmReleaseStatuses = {
  Unknown: 'unknown',
  Failed: 'failed',
  Stalled: 'stalled',
  Reconciling: 'reconciling',
  Reconciled: 'reconciled',
} as const;

export function getHelmReleaseLastAppliedRevision(helmRelease: HelmRelease) {
  return helmRelease.status?.lastAppliedRevision;
}

export function getHelmReleaseLastAttemptedRevision(helmRelease: HelmRelease) {
  return helmRelease.status?.lastAttemptedRevision;
}

export function getHelmReleaseVersion(helmRelease: HelmRelease) {
  if (!helmRelease.status || !helmRelease.status.lastAppliedRevision) {
    return helmRelease.spec?.chart.spec.version;
  }

  return helmRelease.status.lastAppliedRevision;
}

export function getHelmReleaseStatus(helmRelease: HelmRelease) {
  if (!helmRelease.status || !helmRelease.status.conditions) {
    return undefined;
  }
  const conditions = helmRelease.status?.conditions;

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

export function getHelmReleaseClusterName(helmRelease: HelmRelease) {
  return helmRelease.metadata.labels?.[Labels.labelCluster];
}

export function getHelmReleaseChartName(helmRelease: HelmRelease) {
  return helmRelease.spec?.chart.spec.chart;
}

export function getHelmReleaseCreatedTimestamp(
  helmRelease: HelmRelease,
): string | undefined {
  return helmRelease.metadata.creationTimestamp;
}

export function getHelmReleaseUpdatedTimestamp(
  helmRelease: HelmRelease,
): string | undefined {
  const conditions = helmRelease.status?.conditions?.sort((a, b) =>
    compareDates(b.lastTransitionTime, a.lastTransitionTime),
  );

  return (conditions?.find(condition => condition.type === 'Ready') || {})
    .lastTransitionTime;
}

export function getHelmReleaseSourceName(
  helmRelease: HelmRelease,
): string | undefined {
  return helmRelease.spec?.chart.spec.sourceRef?.name;
}
