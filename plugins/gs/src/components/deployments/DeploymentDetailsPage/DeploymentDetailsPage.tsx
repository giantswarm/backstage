import { AsyncDeploymentProvider } from './useCurrentDeployment';
import { DeploymentLayout } from '../DeploymentLayout';
import { DeploymentOverview } from '../deployment-details/DeploymentOverview';
import { DeploymentRoutes } from '../deployment-details/DeploymentRoutes';
import { QueryClientProvider } from '../../QueryClientProvider';
import { ErrorsProvider } from '@giantswarm/backstage-plugin-kubernetes-react';

export const DeploymentDetailsPage = () => {
  return (
    <QueryClientProvider>
      <AsyncDeploymentProvider>
        <DeploymentLayout>
          <DeploymentLayout.Route path="/" title="Overview">
            <ErrorsProvider>
              <DeploymentOverview />
            </ErrorsProvider>
          </DeploymentLayout.Route>
          <DeploymentLayout.Route path="/routes" title="Routes">
            <ErrorsProvider>
              <DeploymentRoutes />
            </ErrorsProvider>
          </DeploymentLayout.Route>
        </DeploymentLayout>
      </AsyncDeploymentProvider>
    </QueryClientProvider>
  );
};
