import {
  Annotations,
  Constants,
  Labels,
} from '@giantswarm/backstage-plugin-gs-common';
import { ClusterStatuses } from './ClusterStatus';
import { toSentenceCase } from '../utils/helpers';
import {
  AWSCluster,
  AzureCluster,
  Cluster,
  ProviderCluster,
  VCDCluster,
  VSphereCluster,
} from '@giantswarm/backstage-plugin-kubernetes-react';

export const ClusterTypes = {
  Management: 'management',
  Workload: 'workload',
} as const;

function isImported(cluster: Cluster) {
  return getClusterAppName(cluster) === Constants.CAPI_IMPORTER_APP_NAME;
}

function isDeleting(cluster: Cluster) {
  return typeof cluster.getDeletionTimestamp() !== 'undefined';
}

function isCreating(cluster: Cluster) {
  const controlPlaneInitializedCondition =
    cluster.findControlPlaneInitializedCondition();

  if (!controlPlaneInitializedCondition) {
    return true;
  }

  return controlPlaneInitializedCondition.status === 'False';
}

function hasClusterAppLabel(cluster: Cluster) {
  return Boolean(
    getClusterAppName(cluster)?.startsWith(Constants.CLUSTER_APP_NAME_PREFIX),
  );
}

export function getClusterDescription(cluster: Cluster) {
  return cluster.getAnnotations()?.[Annotations.annotationClusterDescription];
}

export function getClusterAppName(cluster: Cluster) {
  return cluster.getLabels()?.[Labels.labelApp];
}

export function getClusterAppVersion(cluster: Cluster) {
  return cluster.getLabels()?.[Labels.labelAppVersion];
}

export function getClusterReleaseVersion(cluster: Cluster) {
  return cluster.getLabels()?.[Labels.labelReleaseVersion];
}

export function getClusterOrganization(cluster: Cluster) {
  return cluster.getLabels()?.[Labels.labelOrganization];
}

export function getClusterServicePriority(cluster: Cluster) {
  return cluster.getLabels()?.[Labels.labelServicePriority];
}

export function getClusterCreationTimestamp(cluster: Cluster) {
  return isImported(cluster)
    ? cluster.getAnnotations()?.[
        Annotations.annotationImportedClusterCreationTimestamp
      ]
    : cluster.getCreatedTimestamp();
}

export function isManagementCluster(cluster: Cluster) {
  return (
    cluster.getNamespace() === Constants.MANAGEMENT_CLUSTER_NAMESPACE &&
    cluster.getName() === cluster.cluster &&
    hasClusterAppLabel(cluster)
  );
}

export function calculateClusterType(cluster: Cluster) {
  return isManagementCluster(cluster)
    ? ClusterTypes.Management
    : ClusterTypes.Workload;
}

export function calculateClusterStatus(cluster: Cluster) {
  if (isDeleting(cluster)) {
    return ClusterStatuses.Deleting;
  }

  if (isCreating(cluster)) {
    return ClusterStatuses.Creating;
  }

  return ClusterStatuses.Ready;
}

export function calculateClusterLabels(cluster: Cluster) {
  const labels = cluster.getLabels();
  if (!labels) {
    return undefined;
  }

  return Object.entries(labels).map(([key, value]) => {
    return value === '' ? key : `${key}: ${value}`;
  });
}

export const ClusterProviders = {
  AWS: 'aws',
  Azure: 'azure',
  VSphere: 'vsphere',
  VCD: 'vcd',
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
    case 'cluster-cloud-director':
      return ClusterProviders.VCD;
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
    case ClusterProviders.VCD:
      return 'Cloud Director';
    default:
      return provider;
  }
}

export function formatServicePriority(servicePriority: string) {
  return toSentenceCase(servicePriority);
}

export function findProviderClusterAppVersion(
  providerCluster: ProviderCluster,
) {
  return providerCluster.getLabels()?.[Labels.labelAppVersion];
}

export function findProviderClusterAppSourceLocation(
  providerCluster: ProviderCluster,
) {
  switch (true) {
    case providerCluster instanceof AWSCluster:
      return 'https://github.com/giantswarm/cluster-aws';
    case providerCluster instanceof AzureCluster:
      return 'https://github.com/giantswarm/cluster-azure';
    case providerCluster instanceof VSphereCluster:
      return 'https://github.com/giantswarm/cluster-vsphere';
    case providerCluster instanceof VCDCluster:
      return 'https://github.com/giantswarm/cluster-cloud-director';
    default:
      return undefined;
  }
}

export function getClusterK8sAPIUrl(cluster: Cluster) {
  const controlPlaneEndpoint = cluster.getControlPlaneEndpoint();
  if (!controlPlaneEndpoint) {
    return undefined;
  }

  const host = controlPlaneEndpoint.host;
  const port = controlPlaneEndpoint.port;

  if (!host) return undefined;

  const url = `${host}${port ? `:${port}` : ''}`;

  return url.startsWith('https://') ? url : `https://${url}`;
}
