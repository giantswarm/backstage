import { createContext, ReactNode, useContext } from 'react';
import { useClusterFromUrl } from './useClusterFromUrl';
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
  loading: boolean;
  notFound: boolean;
  error: Error | null;
};

const ClusterContext = createContext<ClusterLoadingStatus>({
  installationName: '',
  cluster: undefined,
  clusterApp: undefined,
  clusterRelease: undefined,
  loading: false,
  notFound: false,
  error: null,
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
}: AsyncClusterProviderProps) => {
  const {
    installationName,
    cluster,
    clusterApp,
    clusterRelease,
    loading,
    notFound,
    error,
  } = useClusterFromUrl();

  const value = {
    installationName,
    cluster,
    clusterApp,
    clusterRelease,
    loading,
    notFound,
    error,
  };

  return (
    <ClusterContext.Provider value={value}>{children}</ClusterContext.Provider>
  );
};

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
