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
