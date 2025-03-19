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
import { FiltersData, useApps, useFilters, useHelmReleases } from '../../hooks';
import { KindFilter } from '../DeploymentsPage/filters/filters';
import { collectDeploymentData, DeploymentData } from './utils';

export type DefaultDeploymentFilters = {
  kind?: KindFilter;
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
    useFilters<DefaultDeploymentFilters>();

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
      return collectDeploymentData({ installationName, deployment });
    });
  }, [appResources, helmReleaseResources, isLoading, deploymentNames]);

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
