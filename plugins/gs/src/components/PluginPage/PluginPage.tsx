import React, { useState } from 'react';
import { Grid } from '@material-ui/core';
import {
  Header,
  Page,
  Content,
  ContentHeader,
  SupportButton,
} from '@backstage/core-components';
import { ClustersTable } from '../ClustersTable';
import { InstallationsSelector } from '../InstallationsSelector';

export const PluginPage = () => {
  const [installations, setInstallations] = useState<string[]>([]);

  const handleInstallationsChange = (selectedInstallations: string[]) => {
    setInstallations(selectedInstallations);
  }

  return (
    <Page themeId="tool">
      <Header title="Kubernetes clusters by Giant Swarm" subtitle="Your Kubernetes clusters as managed or known by your Giant Swarm management clusters." />
      <Content>
        <ContentHeader title="Kubernetes clusters by Giant Swarm">
          <SupportButton>This table shows all the clusters to which you have at least read access via the Giant Swarm management API.</SupportButton>
        </ContentHeader>
        <Grid container spacing={3} direction="column">
          <Grid item>
            <InstallationsSelector onChange={handleInstallationsChange} />
          </Grid>
          <Grid item>
            <ClustersTable installations={installations} />
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
}
