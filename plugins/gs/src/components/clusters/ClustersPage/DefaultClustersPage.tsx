import { ReactNode } from 'react';
import { Content, Header, Page } from '@backstage/core-components';
import { FiltersLayout } from '../../FiltersLayout';
import { ClustersTable } from '../ClustersTable';
import { ClustersDataProvider } from '../ClustersDataProvider';
import { DefaultFilters } from './DefaultFilters';
import { ErrorsProvider } from '../../Errors';
import { QueryClientProvider } from '../../QueryClientProvider';
import { InstallationsProvider } from '../../installations/InstallationsProvider';

export type BaseClustersPageProps = {
  filters: ReactNode;
  content?: ReactNode;
};

export function BaseClustersPage(props: BaseClustersPageProps) {
  const { filters, content = <ClustersTable /> } = props;

  return (
    <Page themeId="service">
      <Header
        title="Kubernetes clusters by Giant Swarm"
        subtitle="Your Kubernetes clusters as managed or known by your Giant Swarm management clusters."
      />
      <Content>
        <ErrorsProvider>
          <ClustersDataProvider>
            <FiltersLayout>
              <FiltersLayout.Filters>{filters}</FiltersLayout.Filters>
              <FiltersLayout.Content>{content}</FiltersLayout.Content>
            </FiltersLayout>
          </ClustersDataProvider>
        </ErrorsProvider>
      </Content>
    </Page>
  );
}

export interface DefaultClustersPageProps {
  emptyContent?: ReactNode;
  filters?: ReactNode;
}

export function DefaultClustersPage(props: DefaultClustersPageProps) {
  const { filters = <DefaultFilters /> } = props;

  return (
    <QueryClientProvider>
      <InstallationsProvider>
        <BaseClustersPage
          filters={filters ?? <DefaultFilters />}
          content={<ClustersTable />}
        />
      </InstallationsProvider>
    </QueryClientProvider>
  );
}
