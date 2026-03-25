import {
  PageBlueprint,
  createFrontendModule,
} from '@backstage/frontend-plugin-api';
import catalogPlugin from '@backstage/plugin-catalog/alpha';

// Catalog index page — render GSCustomCatalogPage directly (full page component)
const catalogIndexPageOverride = PageBlueprint.makeWithOverrides({
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

export const catalogPageOverrides = createFrontendModule({
  pluginId: 'catalog',
  extensions: [catalogIndexPageOverride],
});
