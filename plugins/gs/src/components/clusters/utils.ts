import type { Cluster } from '@giantswarm/backstage-plugin-gs-common';
import {
  getClusterAppName,
  isClusterCreating,
  isClusterDeleting,
  isManagementCluster,
} from '@giantswarm/backstage-plugin-gs-common';
import { ClusterStatuses } from './ClusterStatus';
import { toSentenceCase } from '../utils/helpers';

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

export function calculateClusterStatus(cluster: Cluster) {
  if (isClusterDeleting(cluster)) {
    return ClusterStatuses.Deleting;
  }

  if (isClusterCreating(cluster)) {
    return ClusterStatuses.Creating;
  }

  return ClusterStatuses.Ready;
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

export function formatClusterType(clusterType: 'management' | 'workload') {
  switch (clusterType) {
    case ClusterTypes.Management:
      return 'Management cluster';
    case ClusterTypes.Workload:
      return 'Workload cluster';
    default:
      return clusterType;
  }
}

export function formatClusterProvider(provider: string) {
  switch (provider) {
    case ClusterProviders.AWS:
      return 'AWS';
    case ClusterProviders.Azure:
      return 'Azure';
    case ClusterProviders.VSphere:
      return 'vSphere';
    default:
      return provider;
  }
}

export function formatServicePriority(servicePriority: string) {
  return toSentenceCase(servicePriority);
}
