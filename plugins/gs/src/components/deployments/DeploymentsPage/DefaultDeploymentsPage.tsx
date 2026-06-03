import { ReactNode } from 'react';
import { Content } from '@backstage/core-components';
import { DeploymentsTable } from '../DeploymentsTable';
import { DeploymentsDataProvider } from '../DeploymentsDataProvider';
import { deploymentsRouteRef } from '../../../routes';
import { FiltersLayout } from '../../FiltersLayout';
import { DefaultFilters } from './DefaultFilters';
import { QueryClientProvider } from '../../QueryClientProvider';
import { ErrorsProvider } from '@giantswarm/backstage-plugin-kubernetes-react';

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
  );
}

export interface DefaultDeploymentsPageProps {
  emptyContent?: ReactNode;
  filters?: ReactNode;
}

export function DefaultDeploymentsPage(props: DefaultDeploymentsPageProps) {
  const { filters = <DefaultFilters /> } = props;

  return (
    <QueryClientProvider>
      <BaseDeploymentsPage
        filters={filters ?? <DefaultFilters />}
        content={<DeploymentsTable baseRouteRef={deploymentsRouteRef} />}
      />
    </QueryClientProvider>
  );
}
