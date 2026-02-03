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
  OCIRepository,
  useResources,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { findHelmChartName } from '../utils/findHelmChartName';
import { findResourceByRef } from '../../utils/findResourceByRef';

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

  const {
    resources: ociRepositoryResources,
    isLoading: isLoadingOCIRepositories,
    errors: ociRepositoryErrors,
    retry: retryOCIRepositories,
  } = useResources(activeInstallations, OCIRepository);

  const isLoading =
    isLoadingApps || isLoadingHelmReleases || isLoadingOCIRepositories;

  const errors = useMemo(() => {
    return [...appErrors, ...helmReleaseErrors, ...ociRepositoryErrors];
  }, [appErrors, helmReleaseErrors, ociRepositoryErrors]);
  useShowErrors(errors);

  const retry = useCallback(() => {
    retryApps();
    retryHelmReleases();
    retryOCIRepositories();
  }, [retryApps, retryHelmReleases, retryOCIRepositories]);

  const deploymentsData: DeploymentData[] = useMemo(() => {
    if (isLoading) {
      return [];
    }

    let resources = [...appResources, ...helmReleaseResources];

    if (deploymentNames) {
      resources = resources.filter(resource => {
        let ociRepository = null;
        if (ociRepositoryResources.length) {
          const chartRef =
            resource instanceof HelmRelease && resource.getChartRef();
          if (chartRef && chartRef.kind === 'OCIRepository') {
            ociRepository = findResourceByRef(ociRepositoryResources, {
              installationName: resource.cluster,
              ...chartRef,
            });
          }
        }
        const chartName = findHelmChartName(resource, ociRepository);

        return chartName && deploymentNames.includes(chartName);
      });
    }

    return resources.map(resource => {
      let ociRepository = null;
      if (ociRepositoryResources.length) {
        const chartRef =
          resource instanceof HelmRelease && resource.getChartRef();
        if (chartRef && chartRef.kind === 'OCIRepository') {
          ociRepository = findResourceByRef(ociRepositoryResources, {
            installationName: resource.cluster,
            ...chartRef,
          });
        }
      }

      return collectDeploymentData({
        deployment: resource,
        ociRepository,
        catalogEntitiesMap,
      });
    });
  }, [
    isLoading,
    appResources,
    helmReleaseResources,
    deploymentNames,
    ociRepositoryResources,
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
