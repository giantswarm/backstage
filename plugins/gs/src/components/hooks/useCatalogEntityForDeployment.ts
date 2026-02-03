import { stringifyEntityRef } from '@backstage/catalog-model';
import {
  App,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useCatalogEntitiesForDeployments } from './useCatalogEntitiesForDeployments';
import { useHelmChartNameForDeployment } from './useHelmChartNameForDeployment';
import { useMemo } from 'react';

export function useCatalogEntityForDeployment(deployment: App | HelmRelease) {
  const {
    catalogEntities,
    catalogEntitiesMap,
    isLoading: isLoadingCatalogEntities,
  } = useCatalogEntitiesForDeployments();

  const {
    chartName,
    isLoading: isLoadingChartName,
    errorMessage: chartNameErrorMessage,
  } = useHelmChartNameForDeployment(deployment);

  const entityRef = chartName ? catalogEntitiesMap[chartName] : undefined;

  const catalogEntity = catalogEntities.find(
    entity => stringifyEntityRef(entity) === entityRef,
  );

  return useMemo(() => {
    return {
      catalogEntity,
      isLoading: isLoadingCatalogEntities || isLoadingChartName,
      errorMessage: chartNameErrorMessage,
    };
  }, [
    catalogEntity,
    chartNameErrorMessage,
    isLoadingCatalogEntities,
    isLoadingChartName,
  ]);
}
