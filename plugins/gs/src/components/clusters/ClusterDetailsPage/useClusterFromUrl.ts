import { useRouteRefParams } from '@backstage/core-plugin-api';
import { clusterDetailsRouteRef } from '../../../routes';
import {
  App,
  Cluster,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';

export const useClusterFromUrl = (): {
  installationName: string;
  cluster?: Cluster;
  clusterApp?: App;
  loading: boolean;
  error: Error | null;
} => {
  const { installationName, namespace, name } = useRouteRefParams(
    clusterDetailsRouteRef,
  );

  const {
    resource: clusterApp,
    isLoading: isLoadingClusterApp,
    error: errorClusterApp,
  } = useResource(installationName, App, {
    name,
    namespace,
  });

  const {
    resource: cluster,
    isLoading: isLoadingCluster,
    error: errorCluster,
  } = useResource(installationName, Cluster, {
    name,
    namespace,
  });

  const isLoading = isLoadingClusterApp || isLoadingCluster;
  const error = errorClusterApp || errorCluster;

  return { installationName, cluster, clusterApp, loading: isLoading, error };
};
