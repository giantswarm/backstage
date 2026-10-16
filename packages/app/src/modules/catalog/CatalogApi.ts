import { type CatalogApi, CatalogClient } from '@backstage/catalog-client';
import {
  type ConfigApi,
  configApiRef,
  type DiscoveryApi,
  discoveryApiRef,
  type FetchApi,
  fetchApiRef,
  type IdentityApi,
  identityApiRef,
} from '@backstage/core-plugin-api';
import { ApiBlueprint } from '@backstage/frontend-plugin-api';
import { catalogApiRef } from '@backstage/plugin-catalog-react';
import {
  type GSAuthProvidersApi,
  gsAuthProvidersApiRef,
} from '@giantswarm/backstage-plugin-gs';
import {
  createBackstageFetchApi,
  createReadSilentFetchApi,
  silentIdentity,
} from '../app/backstageFetch';

/**
 * The catalog client, its reads silent: the entity-presentation loader, the
 * catalog page's refetches and every other catalog read run on their own
 * timers, so they take the live portal session's token or fail as
 * session-expired, and never open the Login Required dialog. A write (refresh,
 * unregister, register) is started by the person and keeps the app's fetch,
 * which asks for the sign-in when the session is gone.
 */
export function createSilentReadCatalogClient(deps: {
  configApi: ConfigApi;
  discoveryApi: DiscoveryApi;
  fetchApi: FetchApi;
  identityApi: Pick<IdentityApi, 'getCredentials'>;
  gsAuthProvidersApi: Pick<GSAuthProvidersApi, 'getMainAuthApi'>;
}): CatalogApi {
  const { configApi, discoveryApi, fetchApi, identityApi, gsAuthProvidersApi } =
    deps;
  return new CatalogClient({
    discoveryApi,
    fetchApi: createReadSilentFetchApi({
      fetchApi,
      silentFetchApi: createBackstageFetchApi({
        configApi,
        discoveryApi,
        identityApi: silentIdentity({
          configApi,
          identityApi,
          gsAuthProvidersApi,
        }),
      }),
    }),
  });
}

export const CatalogApiOverride = ApiBlueprint.make({
  params: defineParams =>
    defineParams({
      api: catalogApiRef,
      deps: {
        configApi: configApiRef,
        discoveryApi: discoveryApiRef,
        fetchApi: fetchApiRef,
        identityApi: identityApiRef,
        gsAuthProvidersApi: gsAuthProvidersApiRef,
      },
      factory: deps => createSilentReadCatalogClient(deps),
    }),
});
