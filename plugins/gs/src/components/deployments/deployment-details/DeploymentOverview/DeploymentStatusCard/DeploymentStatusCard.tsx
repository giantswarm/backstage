import { useCurrentDeployment } from '../../../DeploymentDetailsPage/useCurrentDeployment';
import { findTargetClusterName } from '../../../utils/findTargetCluster';
import {
  getWorkloadNamespace,
  getWorkloadPodPrefix,
} from '../../../utils/getWorkloadIdentifiers';
import { useMimirWorkloadStatus } from '../../../../hooks/useMimirWorkloadStatus';
import { AppStatus } from './AppStatus';
import { HelmReleaseConditions } from './HelmReleaseConditions';
import { App } from '@giantswarm/backstage-plugin-kubernetes-react';

export function DeploymentStatusCard() {
  const { deployment, installationName } = useCurrentDeployment();

  const clusterName = findTargetClusterName(deployment);
  const namespace = getWorkloadNamespace(deployment);
  const podPrefix = getWorkloadPodPrefix(deployment);

  const {
    workloads,
    isLoading: workloadsLoading,
    isEnabled: workloadsEnabled,
    error: workloadsError,
    isAvailable: workloadsAvailable,
  } = useMimirWorkloadStatus({
    installationName,
    clusterName,
    namespace,
    podPrefix,
    refetchInterval: 30_000,
  });

  const workloadStatusProps = {
    workloads,
    workloadsLoading,
    workloadsEnabled,
    workloadsError,
    // `undefined` means "still resolving" and is covered by `workloadsLoading`;
    // only an explicit opt-out renders the neutral "unavailable" state.
    workloadsAvailable: workloadsAvailable !== false,
    workloadsLabelSelector: `cluster_id="${clusterName}", namespace="${namespace}", name=~"${podPrefix}.*"`,
  };

  return deployment instanceof App ? (
    <AppStatus app={deployment} {...workloadStatusProps} />
  ) : (
    <HelmReleaseConditions helmrelease={deployment} {...workloadStatusProps} />
  );
}
