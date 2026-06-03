import { type ReactNode } from 'react';
import { Content } from '@backstage/core-components';
import { FluxResourcesTreeView } from '@giantswarm/backstage-plugin-flux-react';
import { QueryClientProvider } from '../QueryClientProvider';

export function FluxResourcesTreePage({ filters }: { filters: ReactNode }) {
  return (
    <QueryClientProvider>
      <Content>
        <FluxResourcesTreeView filters={filters} />
      </Content>
    </QueryClientProvider>
  );
}
