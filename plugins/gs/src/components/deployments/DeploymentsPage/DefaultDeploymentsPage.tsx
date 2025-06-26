import { Content, Header, Page } from '@backstage/core-components';
import { ReactNode } from 'react';
import { DeploymentsTable } from '../DeploymentsTable';
import { DeploymentsDataProvider } from '../DeploymentsDataProvider';
import { deploymentsRouteRef } from '../../../routes';
import { FiltersLayout } from '../../FiltersLayout';
import { DefaultFilters } from './DefaultFilters';
import { ErrorsProvider } from '../../Errors';

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
    <Page themeId="service">
      <Header
        title="Deployed applications"
        subtitle="Instances of your applications deployed to Kubernetes clusters"
      />
      <Content>
        <ErrorsProvider>
          <DeploymentsDataProvider>
            <FiltersLayout>
              <FiltersLayout.Filters>{filters}</FiltersLayout.Filters>
              <FiltersLayout.Content>{content}</FiltersLayout.Content>
            </FiltersLayout>
          </DeploymentsDataProvider>
        </ErrorsProvider>
      </Content>
    </Page>
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
      content={<DeploymentsTable baseRouteRef={deploymentsRouteRef} />}
    />
  );
}
