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
import { useSearchParams } from 'react-router-dom';
import { GSContext } from '../GSContext';

export const EntityDeploymentsContent = () => {
  const { entity } = useEntity();
  const [searchParams, setSearchParams] = useSearchParams();

  const pane = searchParams.get('pane');

  const entityName = entity.metadata.name;
  const deploymentNames = getDeploymentNamesFromEntity(entity) ?? [];
  const sourceLocation = getSourceLocationFromEntity(entity);

  const handleDeploymentDetailsClose = () => {
    setSearchParams(params => {
      params.delete('installation');
      params.delete('kind');
      params.delete('name');
      params.delete('namespace');
      params.delete('pane');

      return params;
    });
  };

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
        <DeploymentDetails
          sourceLocation={sourceLocation}
          isOpen={pane === 'deploymentDetails'}
          onClose={handleDeploymentDetailsClose}
        />
      </Content>
    </GSContext>
  );
};
