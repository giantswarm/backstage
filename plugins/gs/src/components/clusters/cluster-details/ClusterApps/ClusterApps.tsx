import { useCurrentCluster } from '../../ClusterDetailsPage/useCurrentCluster';
import { DeploymentsDataProvider } from '../../../deployments/DeploymentsDataProvider';
import { DeploymentsTable } from '../../../deployments/DeploymentsTable';
import { deploymentsRouteRef } from '../../../../routes';

export const ClusterApps = () => {
  const { installationName, cluster } = useCurrentCluster();
  const clusterName = cluster.getName();

  return (
    <DeploymentsDataProvider
      initialInstallations={[installationName]}
      clusterName={clusterName}
    >
      <DeploymentsTable
        baseRouteRef={deploymentsRouteRef}
        context="cluster-apps"
      />
    </DeploymentsDataProvider>
  );
};
