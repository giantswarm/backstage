import { AsyncClusterProvider } from './useCurrentCluster';
import { ClusterLayout } from '../ClusterLayout';
import { ClusterOverview } from '../cluster-details/ClusterOverview';
import { ClusterSSHAccess } from '../cluster-details/ClusterSSHAccess';
import { QueryClientProvider } from '../../QueryClientProvider';
import { ErrorsProvider } from '@giantswarm/backstage-plugin-kubernetes-react';

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
        </ClusterLayout>
      </AsyncClusterProvider>
    </QueryClientProvider>
  );
};
