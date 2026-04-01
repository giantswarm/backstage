import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { FiltersData, useFilters } from '@giantswarm/backstage-plugin-ui-react';
import {
  useCatalogEntitiesForDeployments,
  useMimirWorkloads,
} from '../../hooks';
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
import { mergeWorkloads, workloadToDeploymentData } from './mimirUtils';
import {
  App,
  HelmRelease,
  OCIRepository,
  useResources,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { findHelmChartName } from '../utils/findHelmChartName';
import { findTargetClusterName } from '../utils/findTargetCluster';
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
  initialInstallations?: string[];
  clusterName?: string;
  children: ReactNode;
};

export const DeploymentsDataProvider = ({
  deploymentNames,
  initialInstallations,
  clusterName,
  children,
}: DeploymentsDataProviderProps) => {
  const [activeInstallations, setActiveInstallations] = useState<string[]>(
    initialInstallations ?? [],
  );

  const { filters, queryParameters, updateFilters } =
    useFilters<DefaultDeploymentFilters>({
      persistToURL: deploymentNames || clusterName ? false : true,
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

  const { workloads: mimirWorkloads, isLoading: isLoadingMimirWorkloads } =
    useMimirWorkloads({ installations: activeInstallations });

  const isLoading =
    isLoadingApps ||
    isLoadingHelmReleases ||
    isLoadingOCIRepositories ||
    isLoadingMimirWorkloads;

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

    const resources = [...appResources, ...helmReleaseResources];

    // Helper to find OCIRepository for a resource
    const findOciRepository = (resource: App | HelmRelease) => {
      if (!ociRepositoryResources.length) return null;

      const chartRef =
        resource instanceof HelmRelease && resource.getChartRef();
      if (chartRef && chartRef.kind === 'OCIRepository') {
        return findResourceByRef(ociRepositoryResources, {
          installationName: resource.cluster,
          ...chartRef,
        });
      }
      return null;
    };

    const k8sData = resources.reduce<DeploymentData[]>((acc, resource) => {
      const ociRepository = findOciRepository(resource);

      // If clusterName filter is active, check if resource targets this cluster
      if (clusterName) {
        const targetCluster = findTargetClusterName(resource);
        if (targetCluster !== clusterName) {
          return acc;
        }
      }

      // If deploymentNames filter is active, check if resource matches
      if (deploymentNames) {
        const chartName = findHelmChartName(resource, ociRepository);
        if (!chartName || !deploymentNames.includes(chartName)) {
          return acc;
        }
      }

      acc.push(
        collectDeploymentData({
          deployment: resource,
          ociRepository,
          catalogEntitiesMap,
        }),
      );
      return acc;
    }, []);

    // Filter Mimir workloads by clusterName and deploymentNames (same as k8s resources above)
    const filteredMimirWorkloads = mimirWorkloads.filter(
      w =>
        (!deploymentNames || deploymentNames.includes(w.name)) &&
        (!clusterName || w.clusterName === clusterName),
    );

    // Merge Mimir workloads: enrich CRD entries with metrics, keep unmatched as standalone
    const mimirData = filteredMimirWorkloads.map(workloadToDeploymentData);

    return mergeWorkloads(k8sData, mimirData, catalogEntitiesMap);
  }, [
    isLoading,
    appResources,
    helmReleaseResources,
    deploymentNames,
    clusterName,
    ociRepositoryResources,
    catalogEntitiesMap,
    mimirWorkloads,
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
