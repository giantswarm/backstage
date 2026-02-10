import { type ReactNode } from 'react';
import {
  FluxPageLayout,
  FluxResourcesListView,
  FluxResourcesTreeView,
} from '@giantswarm/backstage-plugin-flux-react';
import { QueryClientProvider } from '../QueryClientProvider';
import { overviewSubRouteRef } from '../../routes';

export function FluxPage({
  listFilters,
  treeFilters,
}: {
  listFilters: ReactNode;
  treeFilters: ReactNode;
}) {
  return (
    <QueryClientProvider>
      <FluxPageLayout>
        <FluxPageLayout.Route path="/" title="List view">
          <FluxResourcesListView filters={listFilters} />
        </FluxPageLayout.Route>

        <FluxPageLayout.Route path={overviewSubRouteRef.path} title="Tree view">
          <FluxResourcesTreeView filters={treeFilters} />
        </FluxPageLayout.Route>
      </FluxPageLayout>
    </QueryClientProvider>
  );
}
