import { useRouteRefParams } from '@backstage/core-plugin-api';
import { clusterDetailsRouteRef } from '../../../routes';
import {
  App,
  AppKind,
  Cluster,
  ClusterKind,
} from '@giantswarm/backstage-plugin-gs-common';
import { useResource } from '../../hooks';

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
    data: clusterApp,
    isLoading: isLoadingClusterApp,
    error: errorClusterApp,
  } = useResource<App>({
    kind: AppKind,
    installationName,
    name,
    namespace,
  });

  const {
    data: cluster,
    isLoading: isLoadingCluster,
    error: errorCluster,
  } = useResource<Cluster>({
    kind: ClusterKind,
    installationName,
    name,
    namespace,
  });

  const isLoading = isLoadingClusterApp || isLoadingCluster;
  const error = errorClusterApp || errorCluster;

  return { installationName, cluster, clusterApp, loading: isLoading, error };
};
