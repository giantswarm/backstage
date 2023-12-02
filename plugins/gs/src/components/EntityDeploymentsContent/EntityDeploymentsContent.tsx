import React from 'react';
import { Grid } from '@material-ui/core';
import {
  Content,
  ContentHeader,
  SupportButton,
} from '@backstage/core-components';
import {
  useEntity,
} from '@backstage/plugin-catalog-react';
import { AppsTable } from '../AppsTable';
import { InstallationsSelector } from '../InstallationsSelector';
import { getServiceNameFromEntity } from '../getAppNameFromEntity';
import { useInstallations } from '../useInstallations';

export const EntityDeploymentsContent = () => {
  const [installations] = useInstallations();

  const { entity } = useEntity();

  const serviceName = getServiceNameFromEntity(entity);

  return (
    <Content>
      <ContentHeader title={`Deployments of ${serviceName}`}>
        <SupportButton>{`This table shows all the clusters where ${serviceName} is deployed to.`}</SupportButton>
      </ContentHeader>
      <Grid container spacing={3} direction="column">
        <Grid item>
          <InstallationsSelector />
        </Grid>
        <Grid item>
          <AppsTable serviceName={serviceName} installations={installations} />
        </Grid>
      </Grid>
    </Content>
  );
}
