import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import {
  Kustomization,
  HelmRelease,
  GitRepository,
  OCIRepository,
  HelmRepository,
  ImagePolicy,
  ImageRepository,
  ImageUpdateAutomation,
  useShowErrors,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useFluxResources } from '../../hooks/useFluxResources';
import { useTreeSearch } from '../../hooks/useTreeSearch';
import {
  KustomizationTreeBuilder,
  KustomizationTreeNode,
} from '../FluxOverview/utils/KustomizationTreeBuilder/KustomizationTreeBuilder';
import { filterTreeToFailingPaths } from '../FluxOverview/utils/filterTreeToFailingPaths';

export type ResourceType = 'all' | 'flux';

export type StatusFilter = 'all' | 'failing';

export type FluxOverviewData = {
  kustomizations: Kustomization[];
  helmReleases: HelmRelease[];
  gitRepositories: GitRepository[];
  ociRepositories: OCIRepository[];
  helmRepositories: HelmRepository[];
  imagePolicies: ImagePolicy[];
  imageRepositories: ImageRepository[];
  imageUpdateAutomations: ImageUpdateAutomation[];
  isLoading: boolean;
  activeCluster: string | null;
  setActiveCluster: (cluster: string | null) => void;
  resourceType: ResourceType;
  setResourceType: (resourceType: ResourceType) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (statusFilter: StatusFilter) => void;
  treeBuilder?: KustomizationTreeBuilder;
  tree?: KustomizationTreeNode[];
  // Search state
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchMatches: string[];
  pathsToExpand: Set<string>;
  currentMatchIndex: number;
  currentMatchId: string | undefined;
  navigateToNextMatch: () => void;
  navigateToPreviousMatch: () => void;
  totalMatches: number;
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const {
    resources: {
      kustomizations,
      helmReleases,
      gitRepositories,
      ociRepositories,
      helmRepositories,
      imagePolicies,
      imageRepositories,
      imageUpdateAutomations,
    },
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
      imagePolicies,
      imageRepositories,
      imageUpdateAutomations,
    );

    return { treeBuilder: builder, tree: builder.buildTree() };
  }, [
    kustomizations,
    helmReleases,
    gitRepositories,
    ociRepositories,
    helmRepositories,
    imagePolicies,
    imageRepositories,
    imageUpdateAutomations,
    isLoading,
  ]);

  const displayTree = useMemo(() => {
    if (!tree || statusFilter !== 'failing') {
      return tree;
    }

    return filterTreeToFailingPaths(tree);
  }, [tree, statusFilter]);

  const compactView = resourceType === 'flux';

  const {
    searchQuery,
    setSearchQuery,
    searchMatches,
    pathsToExpand,
    currentMatchIndex,
    currentMatchId,
    navigateToNextMatch,
    navigateToPreviousMatch,
    totalMatches,
  } = useTreeSearch({ tree: displayTree, compactView });

  const contextValue: FluxOverviewData = useMemo(() => {
    return {
      kustomizations,
      helmReleases,
      gitRepositories,
      ociRepositories,
      helmRepositories,
      imagePolicies,
      imageRepositories,
      imageUpdateAutomations,
      isLoading,
      activeCluster,
      setActiveCluster,
      resourceType,
      setResourceType,
      statusFilter,
      setStatusFilter,
      treeBuilder,
      tree: displayTree,
      searchQuery,
      setSearchQuery,
      searchMatches,
      pathsToExpand,
      currentMatchIndex,
      currentMatchId,
      navigateToNextMatch,
      navigateToPreviousMatch,
      totalMatches,
    };
  }, [
    kustomizations,
    helmReleases,
    gitRepositories,
    ociRepositories,
    helmRepositories,
    imagePolicies,
    imageRepositories,
    imageUpdateAutomations,
    isLoading,
    activeCluster,
    resourceType,
    statusFilter,
    treeBuilder,
    displayTree,
    searchQuery,
    setSearchQuery,
    searchMatches,
    pathsToExpand,
    currentMatchIndex,
    currentMatchId,
    navigateToNextMatch,
    navigateToPreviousMatch,
    totalMatches,
  ]);

  return (
    <FluxOverviewDataContext.Provider value={contextValue}>
      {children}
    </FluxOverviewDataContext.Provider>
  );
};
