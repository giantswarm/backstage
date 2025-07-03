import { AsyncClusterProvider } from './useCurrentCluster';
import { ClusterLayout } from '../ClusterLayout';
import { ClusterOverview } from '../cluster-details/ClusterOverview';
import { ClusterSSHAccess } from '../cluster-details/ClusterSSHAccess';
import { ErrorsProvider } from '../../Errors';
import { ErrorsProvider as KubernetesErrorsProvider } from '@giantswarm/backstage-plugin-kubernetes-react';
import { QueryClientProvider } from '../../QueryClientProvider';
import { InstallationsProvider } from '../../installations/InstallationsProvider';
import { ClusterDeployments } from '../cluster-details/ClusterDeployments';

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

            <ClusterLayout.Route
              path="/deployments"
              title="Deployments"
              if={({ cluster }) => cluster.metadata.name.includes('pinniped')}
            >
              <KubernetesErrorsProvider>
                <ClusterDeployments />
              </KubernetesErrorsProvider>
            </ClusterLayout.Route>
          </ClusterLayout>
        </AsyncClusterProvider>
      </InstallationsProvider>
    </QueryClientProvider>
  );
};
