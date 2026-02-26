import {
  App,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';

export function findTargetNamespace(deployment: App | HelmRelease) {
  return deployment instanceof HelmRelease
    ? deployment.getTargetNamespace()
    : deployment.getNamespace();
}
