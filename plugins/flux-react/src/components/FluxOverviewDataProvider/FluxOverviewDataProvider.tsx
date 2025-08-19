import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
// import { useShowErrors } from '@giantswarm/backstage-plugin-ui-react';
import {
  Kustomization,
  HelmRelease,
  GitRepository,
  OCIRepository,
  HelmRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useFluxResources } from './useFluxResources';

export type ResourceType = 'all' | 'flux';

export type FluxOverviewData = {
  kustomizations: Kustomization[];
  helmReleases: HelmRelease[];
  gitRepositories: GitRepository[];
  ociRepositories: OCIRepository[];
  helmRepositories: HelmRepository[];
  isLoading: boolean;
  activeCluster: string | null;
  setActiveCluster: (cluster: string | null) => void;
  resourceType: ResourceType;
  setResourceType: (resourceType: ResourceType) => void;
};

const FluxOverviewDataContext = createContext<FluxOverviewData | undefined>(
  undefined,
);

export function useFluxOverviewData(): FluxOverviewData {
  const value = useContext(FluxOverviewDataContext);

  if (!value) {
    throw new Error('FluxOverviewDataContext not available');
  }

  return value;
}

type FluxOverviewDataProviderProps = {
  children: ReactNode;
};

export const FluxOverviewDataProvider = ({
  children,
}: FluxOverviewDataProviderProps) => {
  const [activeCluster, setActiveCluster] = useState<string | null>(null);
  const [resourceType, setResourceType] = useState<ResourceType>('flux');

  const {
    kustomizations,
    helmReleases,
    gitRepositories,
    ociRepositories,
    helmRepositories,
    isLoading,
  } = useFluxResources(activeCluster);

  // const errors = useMemo(() => {
  //   return [
  //     ...clusterErrors,
  //     ...controlPlaneErrors,
  //     ...providerClusterErrors,
  //     ...providerClusterIdentityErrors,
  //   ];
  // }, [
  //   clusterErrors,
  //   controlPlaneErrors,
  //   providerClusterErrors,
  //   providerClusterIdentityErrors,
  // ]);
  // useShowErrors(errors);

  const contextValue: FluxOverviewData = useMemo(() => {
    return {
      kustomizations,
      helmReleases,
      gitRepositories,
      ociRepositories,
      helmRepositories,
      isLoading,
      activeCluster,
      setActiveCluster,
      resourceType,
      setResourceType,
    };
  }, [
    kustomizations,
    helmReleases,
    gitRepositories,
    ociRepositories,
    helmRepositories,
    isLoading,
    activeCluster,
    resourceType,
  ]);

  return (
    <FluxOverviewDataContext.Provider value={contextValue}>
      {children}
    </FluxOverviewDataContext.Provider>
  );
};
