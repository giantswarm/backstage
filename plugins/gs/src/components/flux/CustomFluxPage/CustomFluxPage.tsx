import {
  FluxPageLayout,
  FluxResourcesListView,
  FluxResourcesTreeView,
} from '@giantswarm/backstage-plugin-flux-react';
import { CustomTreeViewFilters } from './CustomTreeViewFilters';
import { CustomListViewFilters } from './CustomListViewFilters';
import { QueryClientProvider } from '../../QueryClientProvider';

export function CustomFluxPage() {
  return (
    <QueryClientProvider>
      <FluxPageLayout>
        <FluxPageLayout.Route path="/" title="List view">
          <FluxResourcesListView filters={<CustomListViewFilters />} />
        </FluxPageLayout.Route>

        <FluxPageLayout.Route path="/tree" title="Tree view">
          <FluxResourcesTreeView filters={<CustomTreeViewFilters />} />
        </FluxPageLayout.Route>
      </FluxPageLayout>
    </QueryClientProvider>
  );
}
