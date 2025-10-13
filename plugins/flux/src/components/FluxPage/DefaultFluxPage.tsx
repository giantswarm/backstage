import {
  FluxPageLayout,
  FluxResourcesListView,
  FluxResourcesTreeView,
} from '@giantswarm/backstage-plugin-flux-react';
import { QueryClientProvider } from '../QueryClientProvider';
import { overviewSubRouteRef } from '../../routes';

export function DefaultFluxPage() {
  return (
    <QueryClientProvider>
      <FluxPageLayout>
        <FluxPageLayout.Route path="/" title="List view">
          <FluxResourcesListView />
        </FluxPageLayout.Route>

        <FluxPageLayout.Route path={overviewSubRouteRef.path} title="Tree view">
          <FluxResourcesTreeView />
        </FluxPageLayout.Route>
      </FluxPageLayout>
    </QueryClientProvider>
  );
}
