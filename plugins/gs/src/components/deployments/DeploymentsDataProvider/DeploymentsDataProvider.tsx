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
} from '@giantswarm/backstage-plugin-gs-common';
import { useApps, useHelmReleases } from '../../hooks';

export type DeploymentData = {
  installationName: string;
  deployment: Deployment;
};

export type DeploymentsData = {
  data: DeploymentData[];
  isLoading: boolean;
  retry: () => void;
};

const DeploymentsDataContext = createContext<DeploymentsData>({
  data: [],
  isLoading: false,
  retry: () => {},
});

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

  const deploymentDataList: DeploymentData[] = useMemo(() => {
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
      const data: DeploymentData = {
        installationName,
        deployment,
      };

      return data;
    });
  }, [isLoading, appResources, helmReleaseResources, deploymentNames]);

  const deploymentsData: DeploymentsData = useMemo(() => {
    return {
      data: deploymentDataList,
      isLoading,
      retry,
    };
  }, [deploymentDataList, isLoading, retry]);

  return (
    <DeploymentsDataContext.Provider value={deploymentsData}>
      {children}
    </DeploymentsDataContext.Provider>
  );
};
