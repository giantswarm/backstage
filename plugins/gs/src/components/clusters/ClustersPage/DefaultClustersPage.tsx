import { ReactNode } from 'react';
import { Content } from '@backstage/core-components';
import { FiltersLayout } from '../../FiltersLayout';
import { ClustersTable } from '../ClustersTable';
import { ClustersDataProvider } from '../ClustersDataProvider';
import { DefaultFilters } from './DefaultFilters';
import { QueryClientProvider } from '../../QueryClientProvider';
import { ErrorsProvider } from '@giantswarm/backstage-plugin-kubernetes-react';

export type BaseClustersPageProps = {
  filters: ReactNode;
  content?: ReactNode;
};

export function BaseClustersPage(props: BaseClustersPageProps) {
  const { filters, content = <ClustersTable /> } = props;

  return (
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
      <BaseClustersPage
        filters={filters ?? <DefaultFilters />}
        content={<ClustersTable />}
      />
    </QueryClientProvider>
  );
}
