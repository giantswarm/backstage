import { createContext, ReactNode, useContext, useMemo } from 'react';
import {
  type ClusterAddress,
  useCluster,
  useClusterFromUrl,
} from './useClusterFromUrl';
import {
  App,
  Cluster,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';

export type ClusterLoadingStatus = {
  installationName: string;
  cluster?: Cluster;
  /** The App that installs the cluster, where an App does. */
  clusterApp?: App;
  /** The HelmRelease that installs the cluster, where no App does. */
  clusterRelease?: HelmRelease;
  /** Deletion was requested and the cluster is not gone yet. */
  isDeleting: boolean;
  loading: boolean;
  notFound: boolean;
  error: Error | null;
  /** Why the last re-read of a cluster already shown failed. */
  refreshError: Error | null;
};

const ClusterContext = createContext<ClusterLoadingStatus>({
  installationName: '',
  cluster: undefined,
  clusterApp: undefined,
  clusterRelease: undefined,
  isDeleting: false,
  loading: false,
  notFound: false,
  error: null,
  refreshError: null,
});

export interface AsyncClusterProviderProps {
  children: ReactNode;
}

/**
 * Provides a loaded cluster to be picked up by the `useCurrentCluster` hook.
 *
 * @public
 */
export const AsyncClusterProvider = ({
  children,
}: AsyncClusterProviderProps) => (
  <ClusterStateProvider state={useClusterFromUrl()}>
    {children}
  </ClusterStateProvider>
);

/**
 * Provides the cluster at `address`, read as the classic page reads it, to
 * `useCurrentCluster` and `useAsyncCluster` below: the shell's cluster page
 * names its cluster through its own route.
 */
export const ClusterProvider = ({
  address,
  children,
}: {
  address: ClusterAddress;
  children: ReactNode;
}) => (
  <ClusterStateProvider state={useCluster(address)}>
    {children}
  </ClusterStateProvider>
);

function ClusterStateProvider({
  state,
  children,
}: {
  state: ClusterLoadingStatus;
  children: ReactNode;
}) {
  const {
    installationName,
    cluster,
    clusterApp,
    clusterRelease,
    isDeleting,
    loading,
    notFound,
    error,
    refreshError,
  } = state;

  const value = useMemo(
    () => ({
      installationName,
      cluster,
      clusterApp,
      clusterRelease,
      isDeleting,
      loading,
      notFound,
      error,
      refreshError,
    }),
    [
      installationName,
      cluster,
      clusterApp,
      clusterRelease,
      isDeleting,
      loading,
      notFound,
      error,
      refreshError,
    ],
  );

  return (
    <ClusterContext.Provider value={value}>{children}</ClusterContext.Provider>
  );
}

/**
 * Grab the current cluster from the context, throws if the cluster has not yet been loaded
 * or is not available.
 *
 * @public
 */
export function useCurrentCluster(): {
  installationName: string;
  cluster: Cluster;
  clusterApp?: App;
  clusterRelease?: HelmRelease;
  isDeleting: boolean;
} {
  const value = useContext(ClusterContext);

  if (!value) {
    throw new Error('ClusterContext not available');
  }

  if (!value.cluster) {
    throw new Error(
      'useCurrentCluster hook is being called outside of an ClusterLayout where the cluster has not been loaded. If this is intentional, please use useAsyncCluster instead.',
    );
  }

  return {
    installationName: value.installationName,
    cluster: value.cluster,
    clusterApp: value.clusterApp,
    clusterRelease: value.clusterRelease,
    isDeleting: value.isDeleting,
  };
}

/**
 * Grab the current cluster from the context, provides loading state and errors, and the ability to refresh.
 *
 * @public
 */
export function useAsyncCluster(): ClusterLoadingStatus {
  const value = useContext(ClusterContext);

  if (!value) {
    throw new Error('ClusterContext not available');
  }

  return value;
}
