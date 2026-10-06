import { useRouteRefParams } from '@backstage/frontend-plugin-api';
import { clusterDetailsRouteRef } from '../../../routes';
import {
  App,
  Cluster,
  HelmRelease,
  useResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';

// A 404, or no error at all: the installation doesn't serve the API group (a
// standalone installation — discovery then resolves nothing and no request is
// made, leaving no resource and no error).
const isNotFound = (error: Error | null) =>
  !error || error.name === 'NotFoundError';

export const useClusterFromUrl = (): {
  installationName: string;
  cluster?: Cluster;
  clusterApp?: App;
  clusterRelease?: HelmRelease;
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

  // A cluster without an App is installed by a Flux HelmRelease of its name,
  // as every cluster cluster-manager creates is. Read only once the App is
  // known to be missing, so an App-based cluster costs no extra request.
  const clusterAppMissing =
    !isLoadingClusterApp && !clusterApp && isNotFound(errorClusterApp);
  const {
    resource: clusterRelease,
    isLoading: isLoadingClusterRelease,
    error: errorClusterRelease,
  } = useResource(
    installationName,
    HelmRelease,
    { name, namespace },
    { enabled: clusterAppMissing },
  );

  const {
    resource: cluster,
    isLoading: isLoadingCluster,
    error: errorCluster,
  } = useResource(installationName, Cluster, {
    name,
    namespace,
  });

  const isLoading =
    isLoadingClusterApp ||
    (clusterAppMissing && isLoadingClusterRelease) ||
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
  // HelmRelease's error then names the cause unless it, too, is a 404.
  const installerError =
    clusterApp || clusterRelease
      ? null
      : (!isNotFound(errorClusterRelease) && errorClusterRelease) ||
        errorClusterApp;

  const error = notFound ? null : installerError || errorCluster;

  return {
    installationName,
    cluster,
    clusterApp,
    clusterRelease,
    loading: isLoading,
    notFound,
    error,
  };
};
