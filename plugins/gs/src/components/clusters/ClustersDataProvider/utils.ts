import {
  calculateClusterProvider,
  getClusterDescription,
  getClusterOrganization,
  getClusterCreationTimestamp,
  getClusterServicePriority,
  getClusterReleaseVersion,
  calculateClusterLabels,
  calculateClusterStatus,
  calculateClusterType,
  findProviderClusterAppSourceLocation,
  findProviderClusterAppVersion,
} from '../utils';
import {
  AWSClusterRoleIdentity,
  Cluster,
  ControlPlane,
  ProviderCluster,
} from '@giantswarm/backstage-plugin-kubernetes-react';

export type ClusterData = {
  installationName: string;
  name: string;
  namespace?: string;
  description?: string;
  type: string;
  organization?: string;
  created?: string;
  priority?: string;
  provider?: string;
  status: string;
  apiVersion: string;
  appVersion?: string;
  appSourceLocation?: string;
  releaseVersion?: string;
  kubernetesVersion?: string;
  location?: string;
  awsAccountId?: string;
  awsAccountUrl?: string;
  labels?: string[];
};

export function collectClusterData({
  installationName,
  cluster,
  controlPlane,
  providerCluster,
  awsClusterRoleIdentity,
}: {
  installationName: string;
  cluster: Cluster;
  controlPlane?: ControlPlane | null;
  providerCluster?: ProviderCluster | null;
  awsClusterRoleIdentity?: AWSClusterRoleIdentity | null;
}): ClusterData {
  const name = cluster.getName();
  const namespace = cluster.getNamespace();
  const apiVersion = cluster.getApiVersion();
  const description = getClusterDescription(cluster);
  const type = calculateClusterType(cluster);
  const organization = getClusterOrganization(cluster);
  const created = getClusterCreationTimestamp(cluster);
  const priority = getClusterServicePriority(cluster);
  const status = calculateClusterStatus(cluster);
  const releaseVersion = getClusterReleaseVersion(cluster);
  const provider = calculateClusterProvider(cluster);
  const labels = calculateClusterLabels(cluster);

  const appVersion = providerCluster
    ? findProviderClusterAppVersion(providerCluster)
    : undefined;

  const appSourceLocation = providerCluster
    ? findProviderClusterAppSourceLocation(providerCluster)
    : undefined;

  const kubernetesVersion = controlPlane
    ? controlPlane.getK8sVersion()
    : undefined;

  const location = providerCluster ? providerCluster.getLocation() : undefined;

  const awsAccountId = awsClusterRoleIdentity
    ? awsClusterRoleIdentity.getAWSAccountId()
    : undefined;

  const awsAccountUrl = awsClusterRoleIdentity
    ? awsClusterRoleIdentity.getAWSAccountUrl()
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
    provider,
    appVersion,
    appSourceLocation,
    kubernetesVersion,
    location,
    awsAccountId,
    awsAccountUrl,
    labels,
  };
}
