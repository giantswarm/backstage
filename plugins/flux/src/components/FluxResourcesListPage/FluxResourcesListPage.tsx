import { type ReactNode } from 'react';
import { Content } from '@backstage/core-components';
import { FluxResourcesListView } from '@giantswarm/backstage-plugin-flux-react';
import { QueryClientProvider } from '../QueryClientProvider';

export function FluxResourcesListPage({ filters }: { filters: ReactNode }) {
  return (
    <QueryClientProvider>
      <Content>
        <FluxResourcesListView filters={filters} />
      </Content>
    </QueryClientProvider>
  );
}
