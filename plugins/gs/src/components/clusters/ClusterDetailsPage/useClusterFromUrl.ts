import { useRouteRefParams } from '@backstage/core-plugin-api';
import { clusterDetailsRouteRef } from '../../../routes';
import { Cluster } from '@giantswarm/backstage-plugin-gs-common';
import { useCluster } from '../../hooks';

export const useClusterFromUrl = (): {
  installationName: string;
  cluster?: Cluster;
  loading: boolean;
  error: Error | null;
} => {
  const { installationName, namespace, name } = useRouteRefParams(
    clusterDetailsRouteRef,
  );

  const {
    data: cluster,
    isLoading,
    error,
  } = useCluster(installationName, name, namespace);

  return { installationName, cluster, loading: isLoading, error };
};
