import React from 'react';
import { Grid } from '@material-ui/core';
import {
  Header,
  Page,
  Content,
  ContentHeader,
  SupportButton,
} from '@backstage/core-components';
import { ClustersTable } from '../ClustersTable';

export const PluginPage = () => (
  <Page themeId="tool">
    <Header title="Welcome to Giant Swarm plugin!" subtitle="Web user interface for Giant Swarm Kubernetes API" />
    <Content>
      <ContentHeader title="MC Kubernetes API">
        <SupportButton>MC Kubernetes API.</SupportButton>
      </ContentHeader>
      <Grid container spacing={3} direction="column">
        <Grid item>
          <ClustersTable />
        </Grid>
      </Grid>
    </Content>
  </Page>
);
