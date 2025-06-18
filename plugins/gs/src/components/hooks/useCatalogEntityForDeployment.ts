import { stringifyEntityRef } from '@backstage/catalog-model';
import {
  AppKind,
  Deployment,
  getAppChartName,
  getHelmReleaseChartName,
} from '@giantswarm/backstage-plugin-gs-common';
import { useCatalogEntitiesForDeployments } from './useCatalogEntitiesForDeployments';

export function useCatalogEntityForDeployment(deployment: Deployment) {
  const { catalogEntities, catalogEntitiesMap } =
    useCatalogEntitiesForDeployments();

  const chartName =
    deployment.kind === AppKind
      ? getAppChartName(deployment)
      : getHelmReleaseChartName(deployment);

  const entityRef = chartName ? catalogEntitiesMap[chartName] : undefined;

  const catalogEntity = catalogEntities.find(
    entity => stringifyEntityRef(entity) === entityRef,
  );

  return { catalogEntity };
}
