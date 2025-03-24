import {
  Deployment,
  isAppTargetClusterManagementCluster,
  isHelmReleaseTargetClusterManagementCluster,
} from '@giantswarm/backstage-plugin-gs-common';
import { ClusterTypes } from '../clusters/utils';

export function calculateClusterType(
  deployment: Deployment,
  installationName: string,
) {
  if (deployment.kind === 'App') {
    return isAppTargetClusterManagementCluster(deployment, installationName)
      ? ClusterTypes.Management
      : ClusterTypes.Workload;
  }

  return isHelmReleaseTargetClusterManagementCluster(deployment)
    ? ClusterTypes.Management
    : ClusterTypes.Workload;
}

export function calculateDeploymentLabels(deployment: Deployment) {
  if (!deployment.metadata.labels) {
    return undefined;
  }

  return Object.entries(deployment.metadata.labels).map(([key, value]) => {
    return value === '' ? key : `${key}: ${value}`;
  });
}
