import { AsyncDeploymentProvider } from './useCurrentDeployment';
import { DeploymentLayout } from '../DeploymentLayout';
import { DeploymentOverview } from '../deployment-details/DeploymentOverview';
import { ErrorsProvider } from '../../Errors';
import { QueryClientProvider } from '../../QueryClientProvider';
import { InstallationsProvider } from '../../installations/InstallationsProvider';

export const DeploymentDetailsPage = () => {
  return (
    <QueryClientProvider>
      <InstallationsProvider>
        <AsyncDeploymentProvider>
          <DeploymentLayout>
            <DeploymentLayout.Route path="/" title="Overview">
              <ErrorsProvider>
                <DeploymentOverview />
              </ErrorsProvider>
            </DeploymentLayout.Route>
          </DeploymentLayout>
        </AsyncDeploymentProvider>
      </InstallationsProvider>
    </QueryClientProvider>
  );
};
