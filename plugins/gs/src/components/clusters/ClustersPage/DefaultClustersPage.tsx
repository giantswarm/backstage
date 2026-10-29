import { ReactElement, ReactNode } from 'react';
import { Content } from '@backstage/core-components';
import { Flex, PluginHeader } from '@backstage/ui';
import StorageIcon from '@material-ui/icons/Storage';
import { FiltersLayout } from '../../FiltersLayout';
import { ClustersTable } from '../ClustersTable';
import { ClustersDataProvider } from '../ClustersDataProvider';
import { DefaultFilters } from './DefaultFilters';
import { QueryClientProvider } from '../../QueryClientProvider';
import { ErrorsProvider } from '@giantswarm/backstage-plugin-kubernetes-react';

export type BaseClustersPageProps = {
  filters: ReactNode;
  content?: ReactNode;
  /** Header actions other plugins attach (Create cluster). */
  actions?: ReactElement[];
};

export function BaseClustersPage(props: BaseClustersPageProps) {
  const { filters, content = <ClustersTable />, actions = [] } = props;

  return (
    <>
      <PluginHeader
        icon={<StorageIcon fontSize="inherit" />}
        title="Clusters"
        customActions={
          actions.length > 0 ? <Flex gap="2">{actions}</Flex> : undefined
        }
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
    </>
  );
}

export interface DefaultClustersPageProps {
  emptyContent?: ReactNode;
  filters?: ReactNode;
  actions?: ReactElement[];
}

export function DefaultClustersPage(props: DefaultClustersPageProps) {
  const { filters = <DefaultFilters />, actions } = props;

  return (
    <QueryClientProvider>
      <BaseClustersPage
        filters={filters ?? <DefaultFilters />}
        content={<ClustersTable />}
        actions={actions}
      />
    </QueryClientProvider>
  );
}
