import type { Cluster } from '@giantswarm/backstage-plugin-gs-common';
import {
  getClusterAppName,
  isManagementCluster,
} from '@giantswarm/backstage-plugin-gs-common';

export const ClusterTypes = {
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

export const ClusterProviders = {
  AWS: 'aws',
  Azure: 'azure',
  VSphere: 'vsphere',
} as const;

export function calculateClusterProvider(cluster: Cluster) {
  const clusterAppName = getClusterAppName(cluster);

  switch (clusterAppName) {
    case 'cluster-aws':
      return ClusterProviders.AWS;
    case 'cluster-azure':
      return ClusterProviders.Azure;
    case 'cluster-vsphere':
      return ClusterProviders.VSphere;
    default:
      return undefined;
  }
}
