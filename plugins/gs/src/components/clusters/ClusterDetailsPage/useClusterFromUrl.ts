import { useRouteRefParams } from '@backstage/frontend-plugin-api';
import { Query } from '@tanstack/react-query';
import { clusterDetailsRouteRef } from '../../../routes';
import {
  App,
  Cluster,
  isNotFound,
  KubeObjectInterface,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { isClusterDeleting } from '../utils';

const DELETING_REFETCH_INTERVAL_MS = 10_000;

/**
 * Re-reads a cluster being deleted until it is gone. A failed read keeps the
 * last data, so polling stops on the first error instead of following it.
 */
export function clusterRefetchInterval(
  query: Query<KubeObjectInterface>,
): number | false {
  const { status, data } = query.state;
  return status === 'success' && data?.metadata?.deletionTimestamp
    ? DELETING_REFETCH_INTERVAL_MS
    : false;
}

export const useClusterFromUrl = (): {
  installationName: string;
  cluster?: Cluster;
  clusterApp?: App;
  isDeleting: boolean;
  loading: boolean;
  notFound: boolean;
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
    resource: lastReadCluster,
    isLoading: isLoadingCluster,
    error: errorCluster,
  } = useResource(
    installationName,
    Cluster,
    { name, namespace },
    { refetchInterval: clusterRefetchInterval },
  );

  // A refetch that 404s keeps the last data: the cluster is gone all the same.
  const cluster = isNotFound(errorCluster) ? undefined : lastReadCluster;
  const isDeleting = cluster ? isClusterDeleting(cluster) : false;

  const isLoading = isLoadingClusterApp || isLoadingCluster;

  // Neither resource exists and nothing failed for another reason: either the
  // resources 404ed, or the installation doesn't serve the API groups at all
  // (a standalone installation — discovery then resolves nothing and no
  // request is made, leaving no resource and no error). Both are "this
  // cluster doesn't exist here", not a fetch failure.
  const isMissing = (error: Error | null) => !error || isNotFound(error);
  const notFound =
    !isLoading &&
    !cluster &&
    !clusterApp &&
    isMissing(errorClusterApp) &&
    isMissing(errorCluster);

  // Deleting a cluster removes its App before the Cluster's finalizers let
  // go of the Cluster, so a cluster being deleted without an App is expected.
  const appGoneWhileDeleting = isDeleting && isNotFound(errorClusterApp);

  const error =
    notFound || appGoneWhileDeleting ? null : errorClusterApp || errorCluster;

  return {
    installationName,
    cluster,
    clusterApp,
    isDeleting,
    loading: isLoading,
    notFound,
    error,
  };
};
