import { useState, useEffect, useCallback } from 'react';
import {
  PageBlueprint,
  createFrontendModule,
} from '@backstage/frontend-plugin-api';
import type { Entity } from '@backstage/catalog-model';
import homePlugin from '@backstage/plugin-home/alpha';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import searchPlugin from '@backstage/plugin-search/alpha';

// Home page — override path from /home to /
const homePageOverride = PageBlueprint.makeWithOverrides({
  factory(originalFactory) {
    return originalFactory({
      noHeader: true,
      routeRef: homePlugin.routes.root,
      path: '/',
      loader: async () => {
        const { HomePage } = await import('./components/home/HomePage');
        return <HomePage />;
      },
    });
  },
});

export const homePageOverrides = createFrontendModule({
  pluginId: 'home',
  extensions: [homePageOverride],
});

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

// Catalog entity page — wrap entityPage in entity data provider
// Replicates the entity-from-URL loading pattern from upstream CatalogEntityPage
const catalogEntityPageOverride = PageBlueprint.makeWithOverrides({
  name: 'entity',
  factory(originalFactory) {
    return originalFactory({
      noHeader: true,
      routeRef: catalogPlugin.routes.catalogEntity,
      path: '/catalog/:namespace/:kind/:name',
      loader: async () => {
        const { entityPage } = await import('./components/catalog/EntityPage');
        const { AsyncEntityProvider, entityRouteRef, catalogApiRef } =
          await import('@backstage/plugin-catalog-react');
        const { useApi, useRouteRefParams } =
          await import('@backstage/core-plugin-api');

        function EntityPageFromUrl() {
          const { kind, namespace, name } = useRouteRefParams(entityRouteRef);
          const catalogApi = useApi(catalogApiRef);
          const [entity, setEntity] = useState<Entity | undefined>();
          const [loading, setLoading] = useState(true);
          const [error, setError] = useState<Error | undefined>();
          const [refreshKey, setRefreshKey] = useState(0);

          useEffect(() => {
            let cancelled = false;
            setLoading(true);
            setError(undefined);
            catalogApi
              .getEntityByRef({ kind, namespace, name })
              .then(e => {
                if (!cancelled) {
                  setEntity(e);
                  setLoading(false);
                }
              })
              .catch(e => {
                if (!cancelled) {
                  setError(e);
                  setLoading(false);
                }
              });
            return () => {
              cancelled = true;
            };
          }, [catalogApi, kind, namespace, name, refreshKey]);

          const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

          return (
            <AsyncEntityProvider
              entity={entity}
              loading={loading}
              error={error}
              refresh={refresh}
            >
              {entityPage}
            </AsyncEntityProvider>
          );
        }

        return <EntityPageFromUrl />;
      },
    });
  },
});

export const catalogPageOverrides = createFrontendModule({
  pluginId: 'catalog',
  extensions: [catalogIndexPageOverride, catalogEntityPageOverride],
});

// Search page — render with custom SearchPage component
const searchPageOverride = PageBlueprint.makeWithOverrides({
  factory(originalFactory) {
    return originalFactory({
      noHeader: true,
      routeRef: searchPlugin.routes.root,
      path: '/search',
      loader: async () => {
        const { SearchPage } = await import('./components/search/SearchPage');
        const { SearchContextProvider } =
          await import('@backstage/plugin-search-react');
        return (
          <SearchContextProvider>
            <SearchPage />
          </SearchContextProvider>
        );
      },
    });
  },
});

export const searchPageOverrides = createFrontendModule({
  pluginId: 'search',
  extensions: [searchPageOverride],
});
