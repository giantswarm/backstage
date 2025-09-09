import {
  Content,
  ContentHeader,
  SupportButton,
} from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { Box } from '@material-ui/core';
import {
  getDeploymentNamesFromEntity,
  getIngressHostFromEntity,
  getGrafanaDashboardFromEntity,
  getSourceLocationFromEntity,
} from '../../utils/entity';
import { DeploymentsTable } from '../DeploymentsTable';
import { DeploymentsDataProvider } from '../DeploymentsDataProvider';
import { entityDeploymentsRouteRef } from '../../../routes';
import {
  ErrorsProvider,
  useClustersInfo,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { InstallationPicker } from './filters/InstallationPicker';
import { QueryClientProvider } from '../../QueryClientProvider';
import { InstallationsProvider } from '../../installations/InstallationsProvider';

const DeploymentsContent = () => {
  const { entity } = useEntity();
  const sourceLocation = getSourceLocationFromEntity(entity);
  const grafanaDashboard = getGrafanaDashboardFromEntity(entity);
  const ingressHost = getIngressHostFromEntity(entity);

  const { clusters } = useClustersInfo();

  return (
    <>
      <Box mb={clusters.length > 1 ? 2 : undefined}>
        <InstallationPicker />
      </Box>
      <DeploymentsTable
        baseRouteRef={entityDeploymentsRouteRef}
        sourceLocation={sourceLocation}
        grafanaDashboard={grafanaDashboard}
        ingressHost={ingressHost}
        context="catalog-entity"
      />
    </>
  );
};

export const EntityDeploymentsContent = () => {
  const { entity } = useEntity();

  const entityName = entity.metadata.name;
  const deploymentNames = getDeploymentNamesFromEntity(entity) ?? [];

  return (
    <QueryClientProvider>
      <InstallationsProvider>
        <Content>
          <ContentHeader title={`Deployments of ${entityName}`}>
            <SupportButton>{`This table shows all the clusters where ${entityName} is deployed to.`}</SupportButton>
          </ContentHeader>
          <ErrorsProvider>
            <DeploymentsDataProvider deploymentNames={deploymentNames}>
              <DeploymentsContent />
            </DeploymentsDataProvider>
          </ErrorsProvider>
        </Content>
      </InstallationsProvider>
    </QueryClientProvider>
  );
};
