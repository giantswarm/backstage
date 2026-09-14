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
  ErrorInfoUnion,
  isNotFoundError,
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

/** Turns a per-cluster list/discovery error into a short status reason. */
export function describeClusterError(error: Error): string {
  if (/timed out/i.test(error.message)) {
    return 'API unreachable (timeout)';
  }
  if (error.name === 'ForbiddenError') {
    return 'Access forbidden';
  }
  if (error.name === 'NotFoundError') {
    return 'API not found';
  }
  return error.message || 'API request failed';
}

/** One installation's cluster-access state, as this page's reads imply it. */
export type ClusterAccessUpdate =
  | { installation: string; state: 'healthy' }
  | { installation: string; state: 'degraded'; reason: string };

/**
 * What this page's cluster reads say about each installation's access: a list
 * that resolved means healthy, a request that failed for a reason other than
 * rejection or an API-version incompatibility means degraded.
 *
 * Installations in `muted` -- switched off in the sidebar Cluster access widget
 * -- yield nothing. A request already in flight when one was switched off still
 * resolves here, after `ClusterAccessConnector` dropped it from the status set,
 * and recording it would put it back as healthy until the next toggle.
 */
export function collectClusterAccessUpdates(
  resolved: { cluster: string }[],
  errors: ErrorInfoUnion[],
  muted: string[],
): ClusterAccessUpdate[] {
  const mutedSet = new Set(muted);
  const updates: ClusterAccessUpdate[] = [];

  for (const { cluster } of resolved) {
    if (!mutedSet.has(cluster)) {
      updates.push({ installation: cluster, state: 'healthy' });
    }
  }

  for (const errorInfo of errors) {
    if (errorInfo.type === 'incompatibility') {
      continue;
    }
    if (errorInfo.error.name === 'RejectedError') {
      continue;
    }
    if (mutedSet.has(errorInfo.cluster)) {
      continue;
    }
    // A 404 means the apiserver answered authoritatively — access to the
    // installation works, it just doesn't serve Cluster API. Healthy, not
    // degraded.
    if (isNotFoundError(errorInfo)) {
      updates.push({ installation: errorInfo.cluster, state: 'healthy' });
      continue;
    }
    updates.push({
      installation: errorInfo.cluster,
      state: 'degraded',
      reason: describeClusterError(errorInfo.error),
    });
  }

  return updates;
}
