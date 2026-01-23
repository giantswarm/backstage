import { ErrorsProvider } from '@giantswarm/backstage-plugin-kubernetes-react';
import { AsyncClusterProvider } from './useCurrentCluster';
import { ClusterLayout } from '../ClusterLayout';
import { ClusterOverview } from '../cluster-details/ClusterOverview';
import { ClusterSSHAccess } from '../cluster-details/ClusterSSHAccess';
import { ClusterDeployments } from '../cluster-details/ClusterDeployments';
import { QueryClientProvider } from '../../QueryClientProvider';

export const ClusterDetailsPage = () => {
  return (
    <QueryClientProvider>
      <AsyncClusterProvider>
        <ClusterLayout>
          <ClusterLayout.Route path="/" title="Overview">
            <ErrorsProvider>
              <ClusterOverview />
            </ErrorsProvider>
          </ClusterLayout.Route>

          <ClusterLayout.Route
            path="/ssh-access"
            title="SSH access"
            if={({ isGSUser }) => isGSUser}
          >
            <ErrorsProvider>
              <ClusterSSHAccess />
            </ErrorsProvider>
          </ClusterLayout.Route>

          <ClusterLayout.Route path="/deployments" title="Deployments">
            <ErrorsProvider>
              <ClusterDeployments />
            </ErrorsProvider>
          </ClusterLayout.Route>
        </ClusterLayout>
      </AsyncClusterProvider>
    </QueryClientProvider>
  );
};
