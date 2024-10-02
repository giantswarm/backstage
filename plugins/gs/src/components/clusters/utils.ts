import type { Cluster } from '@giantswarm/backstage-plugin-gs-common';
import { isManagementCluster } from '@giantswarm/backstage-plugin-gs-common';

const ClusterTypes = {
  Management: 'management',
  Workload: 'workload',
} as const;

export function calculateClusterType(
  cluster: Cluster,
  installationName: string,
) {
  return isManagementCluster(cluster, installationName)
    ? ClusterTypes.Management
    : ClusterTypes.Workload;
}
