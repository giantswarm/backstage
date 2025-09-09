import {
  App,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';

export function getVersion(deployment: App | HelmRelease) {
  if (deployment instanceof App) {
    return deployment.getCurrentVersion();
  }

  if (deployment instanceof HelmRelease) {
    return deployment.getLastAppliedRevision();
  }

  return undefined;
}

export function getAttemptedVersion(deployment: App | HelmRelease) {
  if (deployment instanceof App) {
    return deployment.getVersion();
  }

  if (deployment instanceof HelmRelease) {
    return deployment.getLastAttemptedRevision();
  }

  return undefined;
}
