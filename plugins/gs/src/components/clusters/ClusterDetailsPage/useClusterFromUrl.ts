import { useEffect } from 'react';
import { useRouteRefParams } from '@backstage/frontend-plugin-api';
import { Query, useQueryClient } from '@tanstack/react-query';
import { clusterDetailsRouteRef } from '../../../routes';
import {
  App,
  Cluster,
  HelmRelease,
  KubeObjectInterface,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  DELETING_CLUSTER_REFRESH_MS,
  isClusterDeleting,
  isMarkedForDeletion,
  LIVE_CLUSTER_REFRESH_MS,
} from '../utils';

// A 404, or no error at all: the installation doesn't serve the API group (a
// standalone installation — discovery then resolves nothing and no request is
// made, leaving no resource and no error).
const isNotFound = (error: Error | null) =>
  !error || error.name === 'NotFoundError';

// A failed re-read keeps the last data, so a resource that 404s on a re-read
// would otherwise still look present.
const isGone = (error: Error | null) => error?.name === 'NotFoundError';

/**
 * Re-reads a live cluster slowly, to notice a deletion that starts while the
 * page is open. A cluster being deleted is re-read with the rest of the page
 * (see `useRefreshWhileDeleting`); a gone or never-read one is not.
 */
export function clusterRefetchInterval(
  query: Query<KubeObjectInterface>,
): number | false {
  const { data, error } = query.state;
  if (!data || isGone(error) || isMarkedForDeletion(data)) {
    return false;
  }
  return LIVE_CLUSTER_REFRESH_MS;
}

/**
 * While the cluster is being deleted, re-reads every resource the page shows
 * from its installation, the cluster included, so the page follows the
 * deletion until the cluster is gone.
 */
function useRefreshWhileDeleting(
  installationName: string,
  isDeleting: boolean,
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isDeleting) {
      return undefined;
    }
    const timer = setInterval(() => {
      queryClient.invalidateQueries({
        refetchType: 'active',
        predicate: ({ queryKey }) =>
          queryKey[0] === 'cluster' &&
          queryKey[1] === installationName &&
          (queryKey[2] === 'get' || queryKey[2] === 'list'),
      });
    }, DELETING_CLUSTER_REFRESH_MS);
    return () => clearInterval(timer);
  }, [queryClient, installationName, isDeleting]);
}

export const useClusterFromUrl = (): {
  installationName: string;
  cluster?: Cluster;
  clusterApp?: App;
  clusterRelease?: HelmRelease;
  isDeleting: boolean;
  loading: boolean;
  notFound: boolean;
  error: Error | null;
  refreshError: Error | null;
} => {
  const { installationName, namespace, name } = useRouteRefParams(
    clusterDetailsRouteRef,
  );

  const {
    resource: lastReadClusterApp,
    isLoading: isLoadingClusterApp,
    error: errorClusterApp,
  } = useResource(installationName, App, {
    name,
    namespace,
  });
  const clusterApp = isGone(errorClusterApp) ? undefined : lastReadClusterApp;

  // A cluster without an App is installed by a Flux HelmRelease of its name,
  // as every cluster cluster-manager creates is. Read only once the App is
  // known to be missing, so an App-based cluster costs no extra request.
  const clusterAppMissing =
    !isLoadingClusterApp && !clusterApp && isNotFound(errorClusterApp);
  const {
    resource: lastReadClusterRelease,
    isLoading: isLoadingClusterRelease,
    error: errorClusterRelease,
  } = useResource(
    installationName,
    HelmRelease,
    { name, namespace },
    { enabled: clusterAppMissing },
  );
  const clusterRelease = isGone(errorClusterRelease)
    ? undefined
    : lastReadClusterRelease;

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
  const cluster = isGone(errorCluster) ? undefined : lastReadCluster;
  const isDeleting = cluster ? isClusterDeleting(cluster) : false;

  useRefreshWhileDeleting(installationName, isDeleting);

  // An App that went while the page was open makes the HelmRelease's first
  // read start then: the page already shows the cluster and does not wait.
  const isLoading =
    isLoadingClusterApp ||
    (clusterAppMissing && !lastReadClusterApp && isLoadingClusterRelease) ||
    isLoadingCluster;

  // Neither the cluster nor what installs it exists, and nothing failed for
  // another reason: "this cluster doesn't exist here", not a fetch failure.
  const notFound =
    !isLoading &&
    !cluster &&
    !clusterApp &&
    !clusterRelease &&
    isNotFound(errorClusterApp) &&
    isNotFound(errorClusterRelease) &&
    isNotFound(errorCluster);

  // What installs the cluster is missing only when neither object exists; the
  // HelmRelease's error then names the cause unless it, too, is a 404. A
  // deletion removes the installer before the Cluster's finalizers let go of
  // the Cluster, so a cluster being deleted without one is expected.
  const installerError =
    clusterApp || clusterRelease
      ? null
      : (!isNotFound(errorClusterRelease) && errorClusterRelease) ||
        (isDeleting && isNotFound(errorClusterApp) ? null : errorClusterApp);

  // A cluster read once stays on the page when a re-read fails for another
  // reason than a 404; the failure is shown beside it instead.
  const clusterError = cluster ? null : errorCluster;
  const refreshError = cluster ? errorCluster : null;

  const error = notFound ? null : installerError || clusterError;

  return {
    installationName,
    cluster,
    clusterApp,
    clusterRelease,
    isDeleting,
    loading: isLoading,
    notFound,
    error,
    refreshError,
  };
};
