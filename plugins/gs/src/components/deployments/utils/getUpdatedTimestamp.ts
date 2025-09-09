import {
  App,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { compareDates } from '../../utils/helpers';

function getAppUpdatedTimestamp(app: App) {
  const status = app.getStatus();

  return status?.release.lastDeployed;
}

function getHelmReleaseUpdatedTimestamp(helmRelease: HelmRelease) {
  const conditions = helmRelease.getStatusConditions();

  if (!conditions) {
    return undefined;
  }

  const sortedConditions = conditions.sort((a, b) =>
    compareDates(b.lastTransitionTime, a.lastTransitionTime),
  );

  return (sortedConditions.find(condition => condition.type === 'Ready') || {})
    .lastTransitionTime;
}

export function getUpdatedTimestamp(deployment: App | HelmRelease) {
  if (deployment instanceof App) {
    return getAppUpdatedTimestamp(deployment);
  }

  if (deployment instanceof HelmRelease) {
    return getHelmReleaseUpdatedTimestamp(deployment);
  }

  return undefined;
}
