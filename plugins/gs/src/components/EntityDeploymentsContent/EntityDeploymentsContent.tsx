import React from 'react';
import {
  Content,
  ContentHeader,
  SupportButton,
} from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { DeploymentsTable } from '../DeploymentsTable';
import {
  getDeploymentNamesFromEntity,
  getSourceLocationFromEntity,
} from '../utils/entity';
import { InstallationsWrapper } from '../InstallationsWrapper';
import { DeploymentDetails } from '../DeploymentDetails';
import { GSContext } from '../GSContext';

export const EntityDeploymentsContent = () => {
  const { entity } = useEntity();

  const entityName = entity.metadata.name;
  const deploymentNames = getDeploymentNamesFromEntity(entity) ?? [];
  const sourceLocation = getSourceLocationFromEntity(entity);

  return (
    <GSContext>
      <Content>
        <ContentHeader title={`Deployments of ${entityName}`}>
          <SupportButton>{`This table shows all the clusters where ${entityName} is deployed to.`}</SupportButton>
        </ContentHeader>
        <InstallationsWrapper>
          <DeploymentsTable
            deploymentNames={deploymentNames}
            sourceLocation={sourceLocation}
          />
        </InstallationsWrapper>
        <DeploymentDetails sourceLocation={sourceLocation} />
      </Content>
    </GSContext>
  );
};
