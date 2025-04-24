import { GSContext } from '../../GSContext';
import { AsyncClusterProvider } from './useCurrentCluster';
import { ClusterLayout } from '../ClusterLayout';
import { ClusterOverview } from '../cluster-details/ClusterOverview';
import { ClusterSSHAccess } from '../cluster-details/ClusterSSHAccess';
import { ErrorsProvider } from '../../Errors';

export const ClusterDetailsPage = () => {
  return (
    <GSContext>
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
    </GSContext>
  );
};
