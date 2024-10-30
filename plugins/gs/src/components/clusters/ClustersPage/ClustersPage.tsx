import React from 'react';
import {
  Header,
  Page,
  Content,
  ContentHeader,
  SupportButton,
} from '@backstage/core-components';
import { InstallationsWrapper } from '../../InstallationsWrapper';
import { GSContext } from '../../GSContext';
import { ClustersTable } from '../ClustersTable';

export const ClustersPage = () => {
  return (
    <GSContext>
      <Page themeId="service">
        <Header
          title="Kubernetes clusters by Giant Swarm"
          subtitle="Your Kubernetes clusters as managed or known by your Giant Swarm management clusters."
        />
        <Content>
          <ContentHeader title="Kubernetes clusters by Giant Swarm">
            <SupportButton>
              This table shows all the clusters to which you have at least read
              access via the Giant Swarm management API.
            </SupportButton>
          </ContentHeader>
          <InstallationsWrapper>
            <ClustersTable />
          </InstallationsWrapper>
        </Content>
      </Page>
    </GSContext>
  );
};
