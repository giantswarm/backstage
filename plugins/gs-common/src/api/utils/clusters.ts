import {
  Constants,
  Labels,
  Annotations,
  ClusterConditionTypes,
} from '../constants';
import type { Cluster } from '../types';
import { isConditionFalse } from './conditions';
import { isResourceImported } from './resources';
import * as capi from '../../model/capi';

export { ClusterKind, ClusterNames } from '../../model/capi';

export function getClusterNames() {
  return capi.ClusterNames;
}

export function getClusterGVK(apiVersion?: string) {
  const gvk = capi.getClusterGVK(apiVersion);
  const kind = capi.ClusterKind;

  if (!gvk) {
    throw new Error(
      `${apiVersion} API version is not supported for ${kind} resource.`,
    );
  }

  return gvk;
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

export function getClusterLabels(cluster: Cluster) {
  return cluster.metadata.labels;
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

export function getClusterReleaseVersion(cluster: Cluster) {
  return cluster.metadata.labels?.[Labels.labelReleaseVersion];
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

export function getClusterInfrastructureRef(cluster: Cluster) {
  const infrastructureRef = cluster?.spec?.infrastructureRef;
  if (!infrastructureRef) {
    throw new Error('There is no infrastructure reference defined.');
  }

  const { kind, apiVersion, name, namespace } = infrastructureRef;

  if (!kind || !apiVersion || !name) {
    throw new Error(
      'Kind or API version or name is missing in infrastructure reference.',
    );
  }

  return { kind, apiVersion, name, namespace };
}

export function getClusterControlPlaneRef(cluster: Cluster) {
  const controlPlaneRef = cluster?.spec?.controlPlaneRef;
  if (!controlPlaneRef) {
    throw new Error('There is no control plane reference defined.');
  }

  const { kind, apiVersion, name, namespace } = controlPlaneRef;

  if (!kind || !apiVersion || !name) {
    throw new Error(
      'Kind or API version or name is missing in control plane reference.',
    );
  }

  return { kind, apiVersion, name, namespace };
}

export function getClusterK8sAPIUrl(cluster: Cluster) {
  const host = cluster.spec?.controlPlaneEndpoint?.host;
  const port = cluster.spec?.controlPlaneEndpoint?.port;

  if (!host) return undefined;

  const url = `${host}${port ? `:${port}` : ''}`;

  return url.startsWith('https://') ? url : `https://${url}`;
}
