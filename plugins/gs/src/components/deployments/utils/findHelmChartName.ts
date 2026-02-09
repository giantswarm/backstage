import { findHelmReleaseChartName } from '@giantswarm/backstage-plugin-flux-react';
import {
  App,
  HelmRelease,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';

export function findHelmChartName(
  deployment: App | HelmRelease,
  sourceRepository?: OCIRepository | null,
) {
  if (deployment instanceof App) {
    const spec = deployment.getSpec();

    return spec?.name;
  }

  if (deployment instanceof HelmRelease) {
    return findHelmReleaseChartName(deployment, sourceRepository);
  }

  return undefined;
}
