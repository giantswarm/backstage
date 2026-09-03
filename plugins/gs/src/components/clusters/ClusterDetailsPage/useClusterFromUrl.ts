import { useRouteRefParams } from '@backstage/frontend-plugin-api';
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
    resource: cluster,
    isLoading: isLoadingCluster,
    error: errorCluster,
  } = useResource(installationName, Cluster, {
    name,
    namespace,
  });

  const isLoading = isLoadingClusterApp || isLoadingCluster;

  // Neither resource exists and nothing failed for another reason: either the
  // resources 404ed, or the installation doesn't serve the API groups at all
  // (a standalone installation — discovery then resolves nothing and no
  // request is made, leaving no resource and no error). Both are "this
  // cluster doesn't exist here", not a fetch failure.
  const isNotFound = (error: Error | null) =>
    !error || error.name === 'NotFoundError';
  const notFound =
    !isLoading &&
    !cluster &&
    !clusterApp &&
    isNotFound(errorClusterApp) &&
    isNotFound(errorCluster);

  const error = notFound ? null : errorClusterApp || errorCluster;

  return {
    installationName,
    cluster,
    clusterApp,
    loading: isLoading,
    notFound,
    error,
  };
};
