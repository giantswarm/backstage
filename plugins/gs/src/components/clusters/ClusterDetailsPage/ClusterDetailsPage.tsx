import { AsyncClusterProvider } from './useCurrentCluster';
import { ClusterLayout } from '../ClusterLayout';
import { ClusterApps } from '../cluster-details/ClusterApps';
import { ClusterNodePools } from '../cluster-details/ClusterNodePools';
import { ClusterOverview } from '../cluster-details/ClusterOverview';
import { ClusterRBAC } from '../cluster-details/ClusterRBAC';
import { ClusterSSHAccess } from '../cluster-details/ClusterSSHAccess';
import { isManagementCluster } from '../utils';
import { QueryClientProvider } from '../../QueryClientProvider';
import { ClusterErrorsProvider } from './ClusterErrorsProvider';
import {
  AWSCluster,
  AzureCluster,
} from '@giantswarm/backstage-plugin-kubernetes-react';

export const ClusterDetailsPage = () => {
  return (
    <QueryClientProvider>
      <AsyncClusterProvider>
        <ClusterLayout>
          <ClusterLayout.Route path="/" title="Overview">
            <ClusterErrorsProvider>
              <ClusterOverview />
            </ClusterErrorsProvider>
          </ClusterLayout.Route>
          <ClusterLayout.Route path="/deployments" title="Deployments">
            <ClusterErrorsProvider>
              <ClusterApps />
            </ClusterErrorsProvider>
          </ClusterLayout.Route>
          <ClusterLayout.Route
            path="/node-pools"
            title="Node pools"
            if={({ cluster }) => {
              const infraRef = cluster.getInfrastructureRef();

              return (
                infraRef?.kind === AWSCluster.kind ||
                infraRef?.kind === AzureCluster.kind
              );
            }}
          >
            <ClusterErrorsProvider>
              <ClusterNodePools />
            </ClusterErrorsProvider>
          </ClusterLayout.Route>
          <ClusterLayout.Route
            path="/rbac"
            title="RBAC"
            if={({ cluster }) => isManagementCluster(cluster)}
          >
            <ClusterErrorsProvider>
              <ClusterRBAC />
            </ClusterErrorsProvider>
          </ClusterLayout.Route>
          <ClusterLayout.Route
            path="/ssh-access"
            title="SSH access"
            if={({ isGSUser }) => isGSUser}
          >
            <ClusterErrorsProvider>
              <ClusterSSHAccess />
            </ClusterErrorsProvider>
          </ClusterLayout.Route>
        </ClusterLayout>
      </AsyncClusterProvider>
    </QueryClientProvider>
  );
};
