import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { FiltersData, useFilters } from '@giantswarm/backstage-plugin-ui-react';
import { useCatalogEntitiesForDeployments } from '../../hooks';
import {
  AppFilter,
  KindFilter,
  LabelFilter,
  NamespaceFilter,
  StatusFilter,
  TargetClusterFilter,
  TargetClusterKindFilter,
  VersionFilter,
} from '../DeploymentsPage/filters/filters';
import { collectDeploymentData, DeploymentData } from './utils';
import {
  App,
  HelmRelease,
  useResources,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';

export type DefaultDeploymentFilters = {
  app?: AppFilter;
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
  setActiveInstallations: (installations: string[]) => void;
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
  const [activeInstallations, setActiveInstallations] = useState<string[]>([]);

  const { filters, queryParameters, updateFilters } =
    useFilters<DefaultDeploymentFilters>({
      persistToURL: deploymentNames ? false : true,
    });

  const { catalogEntitiesMap } = useCatalogEntitiesForDeployments();

  const {
    resources: appResources,
    isLoading: isLoadingApps,
    errors: appErrors,
    retry: retryApps,
  } = useResources(activeInstallations, App);

  const {
    resources: helmReleaseResources,
    isLoading: isLoadingHelmReleases,
    errors: helmReleaseErrors,
    retry: retryHelmReleases,
  } = useResources(activeInstallations, HelmRelease);

  const isLoading = isLoadingApps || isLoadingHelmReleases;

  const errors = useMemo(() => {
    return [...appErrors, ...helmReleaseErrors];
  }, [appErrors, helmReleaseErrors]);
  useShowErrors(errors);

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
        const chartName = resource.getChartName();

        return chartName && deploymentNames.includes(chartName);
      });
    }

    return resources.map(resource => {
      return collectDeploymentData({
        deployment: resource,
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
      setActiveInstallations,

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
