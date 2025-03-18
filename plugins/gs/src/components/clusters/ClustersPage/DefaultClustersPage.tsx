import { Content, Header, Page } from '@backstage/core-components';
import React, { ReactNode } from 'react';
import { GSContext } from '../../GSContext';
import { FiltersLayout } from '../../FiltersLayout';
import { ClustersTable } from '../ClustersTable';
import { ClustersDataProvider } from '../ClustersDataProvider';
import { DefaultFilters } from './DefaultFilters';

export type BaseClustersPageProps = {
  filters: ReactNode;
  content?: ReactNode;
};

export function BaseClustersPage(props: BaseClustersPageProps) {
  const { filters, content = <ClustersTable /> } = props;

  return (
    <GSContext>
      <Page themeId="service">
        <Header
          title="Kubernetes clusters by Giant Swarm"
          subtitle="Your Kubernetes clusters as managed or known by your Giant Swarm management clusters."
        />
        <Content>
          <ClustersDataProvider>
            <FiltersLayout>
              <FiltersLayout.Filters>{filters}</FiltersLayout.Filters>
              <FiltersLayout.Content>{content}</FiltersLayout.Content>
            </FiltersLayout>
          </ClustersDataProvider>
        </Content>
      </Page>
    </GSContext>
  );
}

export interface DefaultClustersPageProps {
  emptyContent?: ReactNode;
  filters?: ReactNode;
}

export function DefaultClustersPage(props: DefaultClustersPageProps) {
  const { filters = <DefaultFilters /> } = props;

  return (
    <BaseClustersPage
      filters={filters ?? <DefaultFilters />}
      content={<ClustersTable />}
    />
  );
}
