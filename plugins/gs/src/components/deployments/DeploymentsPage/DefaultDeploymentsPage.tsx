import { Content, Header, Page } from '@backstage/core-components';
import React, { ReactNode } from 'react';
import { GSContext } from '../../GSContext';
import { DeploymentsTable } from '../DeploymentsTable';
import { DeploymentsDataProvider } from '../DeploymentsDataProvider';
import { DetailsPane } from '../../UI';
import { AppDetails } from '../AppDetails';
import { HelmReleaseDetails } from '../HelmReleaseDetails';
import { DEPLOYMENT_DETAILS_PANE_ID } from '../../hooks';
import { deploymentsRouteRef } from '../../../routes';
import { FiltersLayout } from '../../FiltersLayout';
import { DefaultFilters } from './DefaultFilters';

export type BaseDeploymentsPageProps = {
  filters: ReactNode;
  content?: ReactNode;
};

export function BaseDeploymentsPage(props: BaseDeploymentsPageProps) {
  const {
    filters,
    content = <DeploymentsTable baseRouteRef={deploymentsRouteRef} />,
  } = props;

  return (
    <GSContext>
      <Page themeId="service">
        <Header
          title="Deployed applications"
          subtitle="Instances of your applications deployed to Kubernetes clusters"
        />
        <Content>
          <DeploymentsDataProvider>
            <FiltersLayout>
              <FiltersLayout.Filters>{filters}</FiltersLayout.Filters>
              <FiltersLayout.Content>{content}</FiltersLayout.Content>
            </FiltersLayout>
          </DeploymentsDataProvider>
        </Content>
      </Page>
    </GSContext>
  );
}

export interface DefaultDeploymentsPageProps {
  emptyContent?: ReactNode;
  filters?: ReactNode;
}

export function DefaultDeploymentsPage(props: DefaultDeploymentsPageProps) {
  const { filters = <DefaultFilters /> } = props;

  return (
    <BaseDeploymentsPage
      filters={filters ?? <DefaultFilters />}
      content={
        <>
          <DeploymentsTable baseRouteRef={deploymentsRouteRef} />
          <DetailsPane
            paneId={DEPLOYMENT_DETAILS_PANE_ID}
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
        </>
      }
    />
  );
}
