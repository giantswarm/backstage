import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import {
  Kustomization,
  HelmRelease,
  GitRepository,
  OCIRepository,
  HelmRepository,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useFluxResources } from './useFluxResources';
import {
  KustomizationTreeBuilder,
  KustomizationTreeNode,
} from '../FluxOverview/utils/KustomizationTreeBuilder/KustomizationTreeBuilder';
import {
  SelectedResourceRef,
  useSelectedResource,
} from '../FluxOverview/useSelectedResource';

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
  treeBuilder?: KustomizationTreeBuilder;
  tree?: KustomizationTreeNode[];
  selectedResourceRef: SelectedResourceRef | null;
  setSelectedResource: (resourceRef: SelectedResourceRef) => void;
  clearSelectedResource: () => void;
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

  const { selectedResourceRef, setSelectedResource, clearSelectedResource } =
    useSelectedResource();

  const {
    kustomizations,
    helmReleases,
    gitRepositories,
    ociRepositories,
    helmRepositories,
    isLoading,
    errors,
  } = useFluxResources(activeCluster);

  useShowErrors(errors);

  const { treeBuilder, tree } = useMemo(() => {
    if (isLoading || kustomizations.length === 0) {
      return { treeBuilder: undefined, tree: undefined };
    }

    const builder = new KustomizationTreeBuilder(
      kustomizations,
      helmReleases,
      gitRepositories,
      ociRepositories,
      helmRepositories,
    );

    return { treeBuilder: builder, tree: builder.buildTree() };
  }, [
    kustomizations,
    helmReleases,
    gitRepositories,
    ociRepositories,
    helmRepositories,
    isLoading,
  ]);

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
      treeBuilder,
      tree,
      selectedResourceRef,
      setSelectedResource,
      clearSelectedResource,
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
    treeBuilder,
    tree,
    selectedResourceRef,
    setSelectedResource,
    clearSelectedResource,
  ]);

  return (
    <FluxOverviewDataContext.Provider value={contextValue}>
      {children}
    </FluxOverviewDataContext.Provider>
  );
};
