import {
  Deployment,
  isAppTargetClusterManagementCluster,
  isHelmReleaseTargetClusterManagementCluster,
} from '@giantswarm/backstage-plugin-gs-common';
import { ClusterTypes } from '../clusters/utils';

export function calculateClusterType(deployment: Deployment) {
  if (deployment.kind === 'App') {
    return isAppTargetClusterManagementCluster(deployment)
      ? ClusterTypes.Management
      : ClusterTypes.Workload;
  }

  return isHelmReleaseTargetClusterManagementCluster(deployment)
    ? ClusterTypes.Management
    : ClusterTypes.Workload;
}
