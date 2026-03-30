import { EntityContentBlueprint } from '@backstage/plugin-catalog-react/alpha';
import { EntityCatalogGraphCard } from '@backstage/plugin-catalog-graph';

export const GraphEntityContent = EntityContentBlueprint.make({
  name: 'graph',
  params: {
    path: '/graph',
    title: 'Graph',
    filter: 'kind:system',
    loader: async () => <EntityCatalogGraphCard height={800} />,
  },
});
