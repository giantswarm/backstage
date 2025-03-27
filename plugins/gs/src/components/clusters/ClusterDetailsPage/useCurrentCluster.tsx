import { App, Cluster } from '@giantswarm/backstage-plugin-gs-common';
import React, { createContext, ReactNode, useContext } from 'react';
import { useClusterFromUrl } from './useClusterFromUrl';

export type ClusterLoadingStatus = {
  installationName: string;
  cluster?: Cluster;
  clusterApp?: App;
  loading: boolean;
  error: Error | null;
};

const ClusterContext = createContext<ClusterLoadingStatus>({
  installationName: '',
  cluster: undefined,
  clusterApp: undefined,
  loading: false,
  error: null,
});

export interface AsyncClusterProviderProps {
  children: ReactNode;
}

/**
 * Provides a loaded cluster to be picked up by the `useCluster` hook.
 *
 * @public
 */
export const AsyncClusterProvider = ({
  children,
}: AsyncClusterProviderProps) => {
  const { installationName, cluster, clusterApp, loading, error } =
    useClusterFromUrl();

  const value = { installationName, cluster, clusterApp, loading, error };

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
} {
  const value = useContext(ClusterContext);

  if (!value) {
    throw new Error('ClusterContext not available');
  }

  if (!value.cluster) {
    throw new Error(
      'useCluster hook is being called outside of an ClusterLayout where the cluster has not been loaded. If this is intentional, please use useAsyncCluster instead.',
    );
  }

  return { installationName: value.installationName, cluster: value.cluster };
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

  const { installationName, cluster, clusterApp, loading, error } = value;

  return { installationName, cluster, clusterApp, loading, error };
}
