import {
  coreServices,
  createBackendFeatureLoader,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import pgSearchEngineModule from '@backstage/plugin-search-backend-module-pg';

/**
 * Whether the search plugin's database is Postgres, resolved the way
 * Backstage's `DatabaseManager` resolves a plugin's client: its own
 * `backend.database.plugin.search.client`, else the base client.
 */
export function isSearchOnPostgres(config: RootConfigService): boolean {
  return (
    (config.getOptionalString('backend.database.plugin.search.client') ??
      config.getOptionalString('backend.database.client')) === 'pg'
  );
}

/**
 * The Postgres search engine, loaded only where the search plugin's database
 * is Postgres. Elsewhere (SQLite: the chart's default, the dev server, the
 * lab) the module would only step aside with a warning at every start and
 * leave the in-memory engine in place, so it is not loaded at all. On
 * Postgres the module still checks for version 12 or newer, and its warning
 * when that check fails is the one sign that search fell back to memory.
 * See giantswarm/giantswarm#38982.
 */
export const pgSearchEngineLoader = createBackendFeatureLoader({
  deps: { config: coreServices.rootConfig },
  *loader({ config }) {
    if (isSearchOnPostgres(config)) {
      yield pgSearchEngineModule;
    }
  },
});
