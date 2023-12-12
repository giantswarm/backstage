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
import { getServiceNameFromEntity } from '../getAppNameFromEntity';
import { InstallationsWrapper } from '../InstallationsWrapper';

export const EntityDeploymentsContent = () => {
  const { entity } = useEntity();

  const serviceName = getServiceNameFromEntity(entity);

  return (
    <Content>
      <ContentHeader title={`Deployments of ${serviceName}`}>
        <SupportButton>{`This table shows all the clusters where ${serviceName} is deployed to.`}</SupportButton>
      </ContentHeader>
      <InstallationsWrapper>
        <DeploymentsTable serviceName={serviceName} />
      </InstallationsWrapper>
    </Content>
  );
}
