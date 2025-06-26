import {
  Content,
  ContentHeader,
  SupportButton,
} from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import {
  getDeploymentNamesFromEntity,
  getIngressHostFromEntity,
  getGrafanaDashboardFromEntity,
  getSourceLocationFromEntity,
} from '../../utils/entity';
import { InstallationsWrapper } from '../../InstallationsWrapper';
import { DeploymentsTable } from '../DeploymentsTable';
import { DeploymentsDataProvider } from '../DeploymentsDataProvider';
import { entityDeploymentsRouteRef } from '../../../routes';
import { ErrorsProvider } from '../../Errors';

export const EntityDeploymentsContent = () => {
  const { entity } = useEntity();

  const entityName = entity.metadata.name;
  const deploymentNames = getDeploymentNamesFromEntity(entity) ?? [];
  const sourceLocation = getSourceLocationFromEntity(entity);
  const grafanaDashboard = getGrafanaDashboardFromEntity(entity);
  const ingressHost = getIngressHostFromEntity(entity);

  return (
    <Content>
      <ContentHeader title={`Deployments of ${entityName}`}>
        <SupportButton>{`This table shows all the clusters where ${entityName} is deployed to.`}</SupportButton>
      </ContentHeader>
      <ErrorsProvider>
        <InstallationsWrapper>
          <DeploymentsDataProvider deploymentNames={deploymentNames}>
            <DeploymentsTable
              baseRouteRef={entityDeploymentsRouteRef}
              sourceLocation={sourceLocation}
              grafanaDashboard={grafanaDashboard}
              ingressHost={ingressHost}
              context="catalog-entity"
            />
          </DeploymentsDataProvider>
        </InstallationsWrapper>
      </ErrorsProvider>
    </Content>
  );
};
