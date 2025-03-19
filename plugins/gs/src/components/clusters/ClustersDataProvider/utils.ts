import {
  Cluster,
  ControlPlane,
  getClusterCreationTimestamp,
  getClusterDescription,
  getClusterName,
  getClusterNamespace,
  getClusterOrganization,
  getClusterReleaseVersion,
  getClusterServicePriority,
  getControlPlaneK8sVersion,
  getProviderClusterAppSourceLocation,
  getProviderClusterAppVersion,
  getProviderClusterIdentityAWSAccountId,
  getProviderClusterIdentityAWSAccountUrl,
  getProviderClusterLocation,
  ProviderCluster,
  ProviderClusterIdentity,
} from '@giantswarm/backstage-plugin-gs-common';
import { calculateClusterStatus, calculateClusterType } from '../utils';

export type ClusterData = {
  installationName: string;
  name: string;
  namespace?: string;
  description?: string;
  type: string;
  organization?: string;
  created?: string;
  priority?: string;
  status: string;
  apiVersion: string;
  appVersion?: string;
  appSourceLocation?: string;
  releaseVersion?: string;
  kubernetesVersion?: string;
  location?: string;
  awsAccountId?: string;
  awsAccountUrl?: string;
};

export function collectClusterData({
  installationName,
  cluster,
  controlPlane,
  providerCluster,
  providerClusterIdentity,
}: {
  installationName: string;
  cluster: Cluster;
  controlPlane?: ControlPlane | null;
  providerCluster?: ProviderCluster | null;
  providerClusterIdentity?: ProviderClusterIdentity | null;
}): ClusterData {
  const name = getClusterName(cluster);
  const namespace = getClusterNamespace(cluster);
  const apiVersion = cluster.apiVersion;
  const description = getClusterDescription(cluster);
  const type = calculateClusterType(cluster, installationName);
  const organization = getClusterOrganization(cluster);
  const created = getClusterCreationTimestamp(cluster);
  const priority = getClusterServicePriority(cluster);
  const status = calculateClusterStatus(cluster);
  const releaseVersion = getClusterReleaseVersion(cluster);

  const appVersion = providerCluster
    ? getProviderClusterAppVersion(providerCluster)
    : undefined;

  const appSourceLocation = providerCluster
    ? getProviderClusterAppSourceLocation(providerCluster)
    : undefined;

  const kubernetesVersion = controlPlane
    ? getControlPlaneK8sVersion(controlPlane)
    : undefined;

  const location = providerCluster
    ? getProviderClusterLocation(providerCluster)
    : undefined;

  const awsAccountId = providerClusterIdentity
    ? getProviderClusterIdentityAWSAccountId(providerClusterIdentity)
    : undefined;

  const awsAccountUrl = providerClusterIdentity
    ? getProviderClusterIdentityAWSAccountUrl(providerClusterIdentity)
    : undefined;

  return {
    installationName,
    name,
    namespace,
    apiVersion,
    description,
    type,
    organization,
    created,
    priority,
    status,
    releaseVersion,
    appVersion,
    appSourceLocation,
    kubernetesVersion,
    location,
    awsAccountId,
    awsAccountUrl,
  };
}
