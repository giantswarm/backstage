import {
  Content,
  ContentHeader,
  SupportButton,
} from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { Grid } from '@material-ui/core';
import {
  getDeploymentNamesFromEntity,
  getIngressHostFromEntity,
  getGrafanaDashboardFromEntity,
  getSourceLocationFromEntity,
} from '../../utils/entity';
import { DeploymentsTable } from '../DeploymentsTable';
import { DeploymentsDataProvider } from '../DeploymentsDataProvider';
import { entityDeploymentsRouteRef } from '../../../routes';
import { ErrorsProvider } from '../../Errors';
import {
  KubernetesQueryClientProvider,
  useClustersInfo,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { InstallationPicker } from './filters/InstallationPicker';

const DeploymentsContent = () => {
  const { entity } = useEntity();
  const sourceLocation = getSourceLocationFromEntity(entity);
  const grafanaDashboard = getGrafanaDashboardFromEntity(entity);
  const ingressHost = getIngressHostFromEntity(entity);

  const { clusters } = useClustersInfo();

  return (
    <Grid container spacing={3}>
      {clusters.length > 1 ? (
        <Grid item xs={12}>
          <InstallationPicker />
        </Grid>
      ) : null}
      <Grid item xs={12}>
        <DeploymentsTable
          baseRouteRef={entityDeploymentsRouteRef}
          sourceLocation={sourceLocation}
          grafanaDashboard={grafanaDashboard}
          ingressHost={ingressHost}
          context="catalog-entity"
        />
      </Grid>
    </Grid>
  );
};

export const EntityDeploymentsContent = () => {
  const { entity } = useEntity();

  const entityName = entity.metadata.name;
  const deploymentNames = getDeploymentNamesFromEntity(entity) ?? [];

  return (
    <Content>
      <ContentHeader title={`Deployments of ${entityName}`}>
        <SupportButton>{`This table shows all the clusters where ${entityName} is deployed to.`}</SupportButton>
      </ContentHeader>
      <KubernetesQueryClientProvider>
        <ErrorsProvider>
          <DeploymentsDataProvider deploymentNames={deploymentNames}>
            <DeploymentsContent />
          </DeploymentsDataProvider>
        </ErrorsProvider>
      </KubernetesQueryClientProvider>
    </Content>
  );
};
