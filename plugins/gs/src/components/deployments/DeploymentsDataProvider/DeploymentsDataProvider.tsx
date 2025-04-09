import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
} from 'react';
import {
  getAppChartName,
  getHelmReleaseChartName,
} from '@giantswarm/backstage-plugin-gs-common';
import { useApi } from '@backstage/core-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { FiltersData, useApps, useFilters, useHelmReleases } from '../../hooks';
import {
  KindFilter,
  LabelFilter,
  NamespaceFilter,
  StatusFilter,
  TargetClusterFilter,
  TargetClusterKindFilter,
  VersionFilter,
} from '../DeploymentsPage/filters/filters';
import { collectDeploymentData, DeploymentData } from './utils';
import useAsync from 'react-use/esm/useAsync';
import { getDeploymentNamesFromEntity } from '../../utils/entity';

export type DefaultDeploymentFilters = {
  kind?: KindFilter;
  targetCluster?: TargetClusterFilter;
  targetClusterKind?: TargetClusterKindFilter;
  version?: VersionFilter;
  namespace?: NamespaceFilter;
  status?: StatusFilter;
  label?: LabelFilter;
};

export type DeploymentsData = FiltersData<DefaultDeploymentFilters> & {
  data: DeploymentData[];
  filteredData: DeploymentData[];
  isLoading: boolean;
  retry: () => void;
};

const DeploymentsDataContext = createContext<DeploymentsData | undefined>(
  undefined,
);

export function useDeploymentsData(): DeploymentsData {
  const value = useContext(DeploymentsDataContext);

  if (!value) {
    throw new Error('DeploymentsDataContext not available');
  }

  return value;
}

type DeploymentsDataProviderProps = {
  deploymentNames?: string[];
  children: ReactNode;
};

export const DeploymentsDataProvider = ({
  deploymentNames,
  children,
}: DeploymentsDataProviderProps) => {
  const { filters, queryParameters, updateFilters } =
    useFilters<DefaultDeploymentFilters>({
      persistToURL: deploymentNames ? false : true,
    });

  const catalogApi = useApi(catalogApiRef);
  const { value: catalogEntities } = useAsync(async () => {
    const entities = await catalogApi.getEntities({
      filter: { kind: 'component', 'spec.type': 'service' },
    });

    return entities.items;
  });

  const catalogEntitiesMap = useMemo(() => {
    if (!catalogEntities) {
      return {};
    }

    return catalogEntities.reduce((acc: Record<string, string>, entity) => {
      const entityDeploymentNames = getDeploymentNamesFromEntity(entity);
      if (!entityDeploymentNames) {
        return acc;
      }

      entityDeploymentNames.forEach(deploymentName => {
        acc[deploymentName] = stringifyEntityRef(entity);
      });

      return acc;
    }, {});
  }, [catalogEntities]);

  const {
    resources: appResources,
    isLoading: isLoadingApps,
    retry: retryApps,
  } = useApps();

  const {
    resources: helmReleaseResources,
    isLoading: isLoadingHelmReleases,
    retry: retryHelmReleases,
  } = useHelmReleases();

  const isLoading = isLoadingApps || isLoadingHelmReleases;

  const retry = useCallback(() => {
    retryApps();
    retryHelmReleases();
  }, [retryApps, retryHelmReleases]);

  const deploymentsData: DeploymentData[] = useMemo(() => {
    if (isLoading) {
      return [];
    }

    let resources = [...appResources, ...helmReleaseResources];

    if (deploymentNames) {
      resources = resources.filter(resource => {
        const chartName =
          resource.kind === 'App'
            ? getAppChartName(resource)
            : getHelmReleaseChartName(resource);

        return chartName && deploymentNames.includes(chartName);
      });
    }

    return resources.map(({ installationName, ...deployment }) => {
      return collectDeploymentData({
        installationName,
        deployment,
        catalogEntitiesMap,
      });
    });
  }, [
    isLoading,
    appResources,
    helmReleaseResources,
    deploymentNames,
    catalogEntitiesMap,
  ]);

  const contextValue: DeploymentsData = useMemo(() => {
    const appliedFilters = Object.values(filters).filter(filter =>
      Boolean(filter),
    );

    const filteredData = deploymentsData.filter(item => {
      return appliedFilters.every(filter => filter.filter(item));
    });

    return {
      data: deploymentsData,
      filteredData: filteredData,
      isLoading,
      retry,

      filters,
      queryParameters,
      updateFilters,
    };
  }, [
    deploymentsData,
    filters,
    isLoading,
    queryParameters,
    retry,
    updateFilters,
  ]);

  return (
    <DeploymentsDataContext.Provider value={contextValue}>
      {children}
    </DeploymentsDataContext.Provider>
  );
};
