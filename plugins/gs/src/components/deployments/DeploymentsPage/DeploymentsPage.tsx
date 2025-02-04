import React from 'react';
import { Header, Page, Content } from '@backstage/core-components';
import { InstallationsWrapper } from '../../InstallationsWrapper';
import { GSContext } from '../../GSContext';
import { DeploymentsTable } from '../DeploymentsTable';
import { DeploymentsDataProvider } from '../DeploymentsDataProvider';
import { DetailsPane } from '../../UI';
import { AppDetails } from '../AppDetails';
import { HelmReleaseDetails } from '../HelmReleaseDetails';
import { DEPLOYMENT_DETAILS_PANE_ID } from '../../hooks';
import { deploymentsRouteRef } from '../../../routes';

export const DeploymentsPage = () => {
  return (
    <GSContext>
      <Page themeId="service">
        <Header
          title="Deployed applications"
          subtitle="Instances of your applications deployed to Kubernetes clusters"
        />
        <Content>
          <InstallationsWrapper>
            <DeploymentsDataProvider>
              <DeploymentsTable baseRouteRef={deploymentsRouteRef} />
            </DeploymentsDataProvider>
          </InstallationsWrapper>
          <DetailsPane
            paneId={DEPLOYMENT_DETAILS_PANE_ID}
            title="Deployment details"
            render={({ kind, installationName, name, namespace }) => (
              <>
                {kind === 'app' && (
                  <AppDetails
                    installationName={installationName}
                    name={name}
                    namespace={namespace}
                  />
                )}
                {kind === 'helmrelease' && (
                  <HelmReleaseDetails
                    installationName={installationName}
                    name={name}
                    namespace={namespace}
                  />
                )}
              </>
            )}
          />
        </Content>
      </Page>
    </GSContext>
  );
};
