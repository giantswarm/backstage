import { stringifyEntityRef } from '@backstage/catalog-model';
import {
  App,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useCatalogEntitiesForDeployments } from './useCatalogEntitiesForDeployments';
import { useHelmChartNameForDeployment } from './useHelmChartNameForDeployment';

export function useCatalogEntityForDeployment(deployment: App | HelmRelease) {
  const { catalogEntities, catalogEntitiesMap } =
    useCatalogEntitiesForDeployments();

  const { chartName } = useHelmChartNameForDeployment(deployment);

  const entityRef = chartName ? catalogEntitiesMap[chartName] : undefined;

  const catalogEntity = catalogEntities.find(
    entity => stringifyEntityRef(entity) === entityRef,
  );

  return { catalogEntity };
}
