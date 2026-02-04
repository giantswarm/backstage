import {
  App,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useCatalogEntitiesForDeployments } from './useCatalogEntitiesForDeployments';
import { useHelmChartNameForDeployment } from './useHelmChartNameForDeployment';
import { useMemo } from 'react';

export function useCatalogEntityForDeployment(deployment: App | HelmRelease) {
  const { catalogEntitiesMap, isLoading: isLoadingCatalogEntities } =
    useCatalogEntitiesForDeployments();

  const {
    chartName,
    isLoading: isLoadingChartName,
    errorMessage: chartNameErrorMessage,
  } = useHelmChartNameForDeployment(deployment);

  const catalogEntity = chartName ? catalogEntitiesMap[chartName] : undefined;

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
