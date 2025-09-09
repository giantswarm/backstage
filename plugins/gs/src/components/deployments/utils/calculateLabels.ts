import {
  App,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';

export function calculateDeploymentLabels(deployment: App | HelmRelease) {
  const labels = deployment.getLabels();

  if (!labels) {
    return undefined;
  }

  return Object.entries(labels).map(([key, value]) => {
    return value === '' ? key : `${key}: ${value}`;
  });
}
