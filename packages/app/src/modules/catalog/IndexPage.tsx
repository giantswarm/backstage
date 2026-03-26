import { PageBlueprint } from '@backstage/frontend-plugin-api';
import catalogPlugin from '@backstage/plugin-catalog/alpha';

// Catalog index page — render GSCustomCatalogPage directly (full page component)
export const IndexPage = PageBlueprint.makeWithOverrides({
  factory(originalFactory) {
    return originalFactory({
      noHeader: true,
      routeRef: catalogPlugin.routes.catalogIndex,
      path: '/catalog',
      loader: async () => {
        const { GSCustomCatalogPage } =
          await import('@giantswarm/backstage-plugin-gs');
        return <GSCustomCatalogPage />;
      },
    });
  },
});
