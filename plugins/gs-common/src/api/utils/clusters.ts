import {
  Constants,
  Labels,
  Annotations,
  ClusterConditionTypes,
} from '../constants';
import type { Cluster } from '../types';
import { isConditionFalse } from './conditions';
import { isResourceImported } from './resources';
import * as capiv1beta1 from '../../model/capiv1beta1';

export const clusterGVK = [capiv1beta1.clusterGVK];

export function getClusterGVK(apiVersion: string) {
  switch (apiVersion) {
    case capiv1beta1.clusterApiVersion:
      return capiv1beta1.clusterGVK;
    default:
      return undefined;
  }
}

/**
 * Returns whether or not a cluster is a management cluster, by
 * the criteria that the cluster:
 * - is in the `org-giantswarm` namespace
 * - has a name equal to the installation name
 * - is a cluster app (has the `app: cluster-...` label)
 * @param cluster
 * @param installationName
 */
export function isManagementCluster(
  cluster: Cluster,
  installationName: string,
): boolean {
  return (
    cluster.metadata.namespace === Constants.MANAGEMENT_CLUSTER_NAMESPACE &&
    cluster.metadata.name === installationName &&
    hasClusterAppLabel(cluster)
  );
}

/**
 * Determines whether the cluster has an `app` label that starts with the `cluster-` prefix.
 * @param cluster
 */
export function hasClusterAppLabel(cluster: Cluster): boolean {
  return Boolean(
    getClusterAppName(cluster)?.startsWith(Constants.CLUSTER_APP_NAME_PREFIX),
  );
}

export function getClusterName(cluster: Cluster) {
  return cluster.metadata.name;
}

export function getClusterNamespace(cluster: Cluster) {
  return cluster.metadata.namespace;
}

export function getClusterDescription(cluster: Cluster) {
  return cluster.metadata.annotations?.[
    Annotations.annotationClusterDescription
  ];
}

export function getClusterAppName(cluster: Cluster) {
  return cluster.metadata.labels?.[Labels.labelApp];
}

export function getClusterAppVersion(cluster: Cluster) {
  return cluster.metadata.labels?.[Labels.labelAppVersion];
}

export function getClusterOrganization(cluster: Cluster) {
  return cluster.metadata.labels?.[Labels.labelOrganization];
}

export function getClusterServicePriority(cluster: Cluster) {
  return cluster.metadata.labels?.[Labels.labelServicePriority];
}

export function isClusterDeleting(cluster: Cluster) {
  return typeof cluster.metadata.deletionTimestamp !== 'undefined';
}

export function isClusterCreating(cluster: Cluster) {
  if (
    typeof cluster.status === 'undefined' ||
    typeof cluster.status.conditions === 'undefined'
  ) {
    return true;
  }

  return isConditionFalse(
    cluster,
    ClusterConditionTypes.controlPlaneInitialized,
  );
}

export function getClusterCreationTimestamp(cluster: Cluster) {
  return isResourceImported(cluster)
    ? cluster.metadata.annotations?.[
        Annotations.annotationImportedClusterCreationTimestamp
      ]
    : cluster.metadata.creationTimestamp;
}
