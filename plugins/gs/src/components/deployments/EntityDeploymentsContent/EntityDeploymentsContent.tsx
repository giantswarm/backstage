import React from 'react';
import {
  Content,
  ContentHeader,
  SupportButton,
} from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { DEPLOYMENT_DETAILS_PANE_ID } from '../../hooks';
import {
  getDeploymentNamesFromEntity,
  getIngressHostFromEntity,
  getGrafanaDashboardFromEntity,
  getSourceLocationFromEntity,
} from '../../utils/entity';
import { GSContext } from '../../GSContext';
import { InstallationsWrapper } from '../../InstallationsWrapper';
import { DetailsPane } from '../../UI';
import { DeploymentsTable } from '../DeploymentsTable';
import { AppDetails } from '../AppDetails';
import { HelmReleaseDetails } from '../HelmReleaseDetails';
import { DeploymentsDataProvider } from '../DeploymentsDataProvider';
import { entityDeploymentsRouteRef } from '../../../routes';

export const EntityDeploymentsContent = () => {
  const { entity } = useEntity();

  const entityName = entity.metadata.name;
  const deploymentNames = getDeploymentNamesFromEntity(entity) ?? [];
  const sourceLocation = getSourceLocationFromEntity(entity);
  const grafanaDashboard = getGrafanaDashboardFromEntity(entity);
  const ingressHost = getIngressHostFromEntity(entity);

  return (
    <GSContext>
      <Content>
        <ContentHeader title={`Deployments of ${entityName}`}>
          <SupportButton>{`This table shows all the clusters where ${entityName} is deployed to.`}</SupportButton>
        </ContentHeader>
        <InstallationsWrapper>
          <DeploymentsDataProvider deploymentNames={deploymentNames}>
            <DeploymentsTable
              baseRouteRef={entityDeploymentsRouteRef}
              sourceLocation={sourceLocation}
              grafanaDashboard={grafanaDashboard}
              ingressHost={ingressHost}
            />
          </DeploymentsDataProvider>
        </InstallationsWrapper>
        <DetailsPane
          paneId={DEPLOYMENT_DETAILS_PANE_ID}
          render={({ kind, installationName, name, namespace }) => (
            <>
              {kind === 'app' && (
                <AppDetails
                  installationName={installationName}
                  name={name}
                  namespace={namespace}
                  sourceLocation={sourceLocation}
                  grafanaDashboard={grafanaDashboard}
                  ingressHost={ingressHost}
                />
              )}
              {kind === 'helmrelease' && (
                <HelmReleaseDetails
                  installationName={installationName}
                  name={name}
                  namespace={namespace}
                  sourceLocation={sourceLocation}
                  grafanaDashboard={grafanaDashboard}
                  ingressHost={ingressHost}
                />
              )}
            </>
          )}
        />
      </Content>
    </GSContext>
  );
};
