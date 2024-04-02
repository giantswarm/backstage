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
import { DetailsPane } from '../../UI/DetailsPane';
import { CLUSTER_DETAILS_PANE_ID } from '../../hooks';
import { ClustersTable } from '../ClustersTable';
import { ClusterDetails } from '../ClusterDetails';

export const ClustersPage = () => {
  return (
    <GSContext>
      <Page themeId="tool">
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
          <DetailsPane
            paneId={CLUSTER_DETAILS_PANE_ID}
            title="Cluster details"
            render={({ installationName, gvk, name, namespace }) => (
              <ClusterDetails
                installationName={installationName}
                gvk={gvk}
                name={name}
                namespace={namespace}
              />
            )}
          />
        </Content>
      </Page>
    </GSContext>
  );
};
