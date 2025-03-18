import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
} from 'react';
import {
  Deployment,
  getAppChartName,
  getHelmReleaseChartName,
  Resource,
} from '@giantswarm/backstage-plugin-gs-common';
import { useApps, useHelmReleases } from '../../hooks';
import { FiltersData, useFilters } from './useFilters';

export type DeploymentData = {
  installationName: string;
  deployment: Deployment;
};

export type DeploymentsData = FiltersData & {
  data: DeploymentData[];
  resources: Resource<Deployment>[];
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
  const { filters, queryParameters, updateFilters } = useFilters();

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

  const resources = useMemo(() => {
    let allResources = [...appResources, ...helmReleaseResources];

    if (deploymentNames) {
      allResources = allResources.filter(resource => {
        const chartName =
          resource.kind === 'App'
            ? getAppChartName(resource)
            : getHelmReleaseChartName(resource);

        return chartName && deploymentNames.includes(chartName);
      });
    }

    return allResources;
  }, [appResources, helmReleaseResources, deploymentNames]);

  const deploymentDataList: DeploymentData[] = useMemo(() => {
    if (isLoading) {
      return [];
    }

    const appliedFilters = Object.values(filters).filter(filter =>
      Boolean(filter),
    );

    const filteredResources = resources.filter(resource => {
      return appliedFilters.every(filter => filter.filter(resource));
    });

    return filteredResources.map(({ installationName, ...deployment }) => {
      const data: DeploymentData = {
        installationName,
        deployment,
      };

      return data;
    });
  }, [filters, isLoading, resources]);

  const deploymentsData: DeploymentsData = useMemo(() => {
    return {
      resources,
      data: deploymentDataList,
      isLoading,
      retry,

      filters,
      queryParameters,
      updateFilters,
    };
  }, [
    deploymentDataList,
    filters,
    isLoading,
    queryParameters,
    resources,
    retry,
    updateFilters,
  ]);

  return (
    <DeploymentsDataContext.Provider value={deploymentsData}>
      {children}
    </DeploymentsDataContext.Provider>
  );
};
