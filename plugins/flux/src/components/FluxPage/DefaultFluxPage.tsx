import {
  FluxPageLayout,
  FluxResourcesListView,
  FluxResourcesTreeView,
} from '@giantswarm/backstage-plugin-flux-react';
import { QueryClientProvider } from '../QueryClientProvider';

export function DefaultFluxPage() {
  return (
    <QueryClientProvider>
      <FluxPageLayout>
        <FluxPageLayout.Route path="/" title="Tree view">
          <FluxResourcesTreeView />
        </FluxPageLayout.Route>

        <FluxPageLayout.Route path="/list" title="List view">
          <FluxResourcesListView />
        </FluxPageLayout.Route>
      </FluxPageLayout>
    </QueryClientProvider>
  );
}
