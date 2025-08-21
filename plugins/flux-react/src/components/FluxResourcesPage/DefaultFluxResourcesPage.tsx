import { ReactNode } from 'react';
import { Content, Header, Page } from '@backstage/core-components';
import {
  KubernetesQueryClientProvider,
  ErrorsProvider,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { FiltersLayout } from '@giantswarm/backstage-plugin-ui-react';
import { FluxResourcesTable } from '../FluxResourcesTable';
import { FluxResourcesDataProvider } from '../FluxResourcesDataProvider';
import { DefaultFilters } from './DefaultFilters';

export type BaseFluxResourcesPageProps = {
  filters: ReactNode;
  content?: ReactNode;
};

export function BaseFluxResourcesPage(props: BaseFluxResourcesPageProps) {
  const { filters, content = <FluxResourcesTable /> } = props;

  return (
    <Page themeId="service">
      <Header
        title="Flux Resources"
        subtitle="Overview of Flux resources across clusters"
      />
      <Content>
        <KubernetesQueryClientProvider>
          <ErrorsProvider>
            <FluxResourcesDataProvider>
              <FiltersLayout fullHeight>
                <FiltersLayout.Filters>{filters}</FiltersLayout.Filters>
                <FiltersLayout.Content>{content}</FiltersLayout.Content>
              </FiltersLayout>
            </FluxResourcesDataProvider>
          </ErrorsProvider>
        </KubernetesQueryClientProvider>
      </Content>
    </Page>
  );
}

export interface DefaultFluxResourcesPageProps {
  emptyContent?: ReactNode;
  filters?: ReactNode;
}

export function DefaultFluxResourcesPage(props: DefaultFluxResourcesPageProps) {
  const { filters = <DefaultFilters /> } = props;

  return (
    <BaseFluxResourcesPage
      filters={filters ?? <DefaultFilters />}
      content={<FluxResourcesTable />}
    />
  );
}
