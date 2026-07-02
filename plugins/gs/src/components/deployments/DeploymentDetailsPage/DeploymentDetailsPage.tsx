import { AsyncDeploymentProvider } from './useCurrentDeployment';
import { DeploymentLayout } from '../DeploymentLayout';
import { DeploymentOverview } from '../deployment-details/DeploymentOverview';
import { DeploymentGateway } from '../deployment-details/DeploymentGateway';
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
          <DeploymentLayout.Route path="/gateways" title="Gateways">
            <ErrorsProvider>
              <DeploymentGateway />
            </ErrorsProvider>
          </DeploymentLayout.Route>
        </DeploymentLayout>
      </AsyncDeploymentProvider>
    </QueryClientProvider>
  );
};
