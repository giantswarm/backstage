import { AsyncClusterProvider } from './useCurrentCluster';
import { ClusterLayout } from '../ClusterLayout';
import { ClusterOverview } from '../cluster-details/ClusterOverview';
import { ClusterSSHAccess } from '../cluster-details/ClusterSSHAccess';
import { ErrorsProvider } from '../../Errors';
import { QueryClientProvider } from '../../QueryClientProvider';
import { InstallationsProvider } from '../../installations/InstallationsProvider';

export const ClusterDetailsPage = () => {
  return (
    <QueryClientProvider>
      <InstallationsProvider>
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
      </InstallationsProvider>
    </QueryClientProvider>
  );
};
