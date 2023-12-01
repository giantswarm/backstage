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
import { getAppNameFromEntity } from '../getAppNameFromEntity';
import { useInstallations } from '../useInstallations';

export const EntityDeployedToContent = () => {
  const [installations] = useInstallations();

  const { entity } = useEntity();

  const appName = getAppNameFromEntity(entity);

  return (
    <Content>
      <ContentHeader title={`Deployments of ${appName}`}>
        <SupportButton>{`This table shows all the clusters where ${appName} is deployed to.`}</SupportButton>
      </ContentHeader>
      <Grid container spacing={3} direction="column">
        <Grid item>
          <InstallationsSelector />
        </Grid>
        <Grid item>
          <AppsTable appName={appName} installations={installations} />
        </Grid>
      </Grid>
    </Content>
  );
}
