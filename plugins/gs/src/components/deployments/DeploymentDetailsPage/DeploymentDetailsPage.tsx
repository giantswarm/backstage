import { AsyncDeploymentProvider } from './useCurrentDeployment';
import { DeploymentLayout } from '../DeploymentLayout';
import { DeploymentOverview } from '../deployment-details/DeploymentOverview';
import { ErrorsProvider } from '../../Errors';

export const DeploymentDetailsPage = () => {
  return (
    <AsyncDeploymentProvider>
      <DeploymentLayout>
        <DeploymentLayout.Route path="/" title="Overview">
          <ErrorsProvider>
            <DeploymentOverview />
          </ErrorsProvider>
        </DeploymentLayout.Route>
      </DeploymentLayout>
    </AsyncDeploymentProvider>
  );
};
