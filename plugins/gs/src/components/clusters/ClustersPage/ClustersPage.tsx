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
import { DetailsPane } from '../../UI';
import { CLUSTER_ACCESS_PANE_ID } from '../../hooks';
import { ClustersTable } from '../ClustersTable';
import { ClusterAccess } from '../ClusterAccess';
import { ClusterWrapper } from '../ClusterWrapper';

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
            paneId={CLUSTER_ACCESS_PANE_ID}
            title="Cluster access"
            render={({ installationName, gvk, name, namespace }) => (
              <ClusterWrapper
                installationName={installationName}
                gvk={gvk}
                name={name}
                namespace={namespace}
                render={cluster => (
                  <ClusterAccess
                    cluster={cluster}
                    installationName={installationName}
                  />
                )}
              />
            )}
          />
        </Content>
      </Page>
    </GSContext>
  );
};
