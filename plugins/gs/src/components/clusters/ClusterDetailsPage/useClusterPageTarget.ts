import { useAsyncCluster } from './useCurrentCluster';
import { getClusterOrganization, isManagementCluster } from '../utils';

/** The cluster a cluster page shows, as an action other plugins attach needs it. */
export type ClusterPageTarget = {
  installationName: string;
  name: string;
  namespace: string;
  /** The organization the cluster belongs to: its label, else its `org-` namespace. */
  organization: string;
  /** The installation's own cluster. */
  isManagementCluster: boolean;
  /** Deletion was requested and the cluster is not gone yet. */
  isDeleting: boolean;
};

const ORG_NAMESPACE_PREFIX = 'org-';

/**
 * The cluster of the page a `clusterActions` attachment of `page:gs/clusters`
 * renders on; `undefined` while it loads or where it is not found. Plain
 * fields rather than the resource, so the contributing plugin depends on no
 * more of this one than this hook.
 *
 * @public
 */
export function useClusterPageTarget(): ClusterPageTarget | undefined {
  const { installationName, cluster, isDeleting } = useAsyncCluster();
  if (!cluster) {
    return undefined;
  }
  const namespace = cluster.getNamespace() ?? '';
  return {
    installationName,
    name: cluster.getName(),
    namespace,
    organization:
      getClusterOrganization(cluster) ??
      (namespace.startsWith(ORG_NAMESPACE_PREFIX)
        ? namespace.slice(ORG_NAMESPACE_PREFIX.length)
        : ''),
    isManagementCluster: isManagementCluster(cluster),
    isDeleting,
  };
}
