import React from 'react';
import {
  Content,
  ContentHeader,
  SupportButton,
} from '@backstage/core-components';
import {
  useEntity,
} from '@backstage/plugin-catalog-react';
import { DeploymentsTable } from '../DeploymentsTable';
import { getProjectSlugFromEntity, getServiceNameFromEntity } from '../getAppNameFromEntity';
import { InstallationsWrapper } from '../InstallationsWrapper';
import { DeploymentDetails } from '../DeploymentDetails';
import { useSearchParams } from 'react-router-dom';

export const EntityDeploymentsContent = () => {
  const { entity } = useEntity();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const pane = searchParams.get('pane');

  const serviceName = getServiceNameFromEntity(entity);
  const projectSlug = getProjectSlugFromEntity(entity);

  const handleDeploymentDetailsClose = () => {
    setSearchParams((params) => {
      params.delete('installation');
      params.delete('kind');
      params.delete('name');
      params.delete('namespace');
      params.delete('pane');

      return params;
    })
  }

  return (
    <Content>
      <ContentHeader title={`Deployments of ${serviceName}`}>
        <SupportButton>{`This table shows all the clusters where ${serviceName} is deployed to.`}</SupportButton>
      </ContentHeader>
      <InstallationsWrapper>
        <DeploymentsTable
          serviceName={serviceName}
          projectSlug={projectSlug}
        />
      </InstallationsWrapper>
      <DeploymentDetails
        projectSlug={projectSlug}
        isOpen={pane === 'deploymentDetails'}
        onClose={handleDeploymentDetailsClose}
      />
    </Content>
  );
}
