import { createFetchApi, FetchMiddlewares } from '@backstage/core-app-api';
import type {
  ConfigApi,
  DiscoveryApi,
  FetchApi,
  IdentityApi,
} from '@backstage/core-plugin-api';
import {
  GSDiscoveryApiClient,
  type GSAuthProvidersApi,
} from '@giantswarm/backstage-plugin-gs';

/**
 * The portal's fetch: `plugin://` URLs resolved through discovery, and the
 * person's Backstage token sent as `X-Backstage-Token` to the portal's own
 * backends.
 *
 * Which token path `identityApi` takes decides whether a request may prompt:
 * the app's identity asks for the sign-in (Login Required) once the session is
 * gone; {@link silentIdentity} never does.
 */
export function createBackstageFetchApi(options: {
  configApi: ConfigApi;
  discoveryApi: DiscoveryApi;
  identityApi: Pick<IdentityApi, 'getCredentials'>;
}): FetchApi {
  const { configApi, discoveryApi, identityApi } = options;
  return createFetchApi({
    middleware: [
      FetchMiddlewares.resolvePluginProtocol({ discoveryApi }),
      FetchMiddlewares.injectIdentityAuth({
        identityApi: identityApi as IdentityApi,
        config: configApi,
        // Per-request matcher (not a static allowlist): the per-installation
        // `backendUrl` overrides are loaded from the backend after sign-in, so
        // the set of URLs needing the Backstage token grows after app boot.
        allowUrl:
          GSDiscoveryApiClient.createUrlPrefixAllowlistMatcher(configApi),
        header: {
          name: 'X-Backstage-Token',
          value: (token: string) => `Bearer ${token}`,
        },
      }),
    ],
  });
}

export const PORTAL_SESSION_EXPIRED_ERROR_NAME = 'PortalSessionExpiredError';

/**
 * Thrown by a silent read when the portal session is gone, before any request
 * is sent. Its message reads as session-expired to `isSessionExpiredError`.
 */
export class PortalSessionExpiredError extends Error {
  constructor() {
    super('Your portal session expired; reload the page to sign in again.');
    this.name = PORTAL_SESSION_EXPIRED_ERROR_NAME;
  }
}

/**
 * An identity whose credentials come from the live portal session only: the
 * main login provider's optional path, which refreshes the session silently
 * where it can and otherwise answers "none" instead of opening the sign-in.
 * Without a session it throws {@link PortalSessionExpiredError}.
 *
 * A portal without `gs.authProvider` (local development) signs in as guest,
 * whose credentials never prompt: there the app's identity serves.
 */
export function silentIdentity(options: {
  configApi: ConfigApi;
  identityApi: Pick<IdentityApi, 'getCredentials'>;
  gsAuthProvidersApi: Pick<GSAuthProvidersApi, 'getMainAuthApi'>;
}): Pick<IdentityApi, 'getCredentials'> {
  const { configApi, identityApi, gsAuthProvidersApi } = options;
  return {
    async getCredentials() {
      if (!configApi.has('gs.authProvider')) {
        return identityApi.getCredentials();
      }
      const identity = await gsAuthProvidersApi
        .getMainAuthApi()
        .getBackstageIdentity({ optional: true });
      if (!identity?.token) {
        throw new PortalSessionExpiredError();
      }
      return { token: identity.token };
    },
  };
}

/**
 * Sends reads (GET, HEAD and the catalog's `POST …/entities/by-refs`) through
 * `silentFetchApi` and every other request -- a write a person starts --
 * through `fetchApi`, which may ask for the sign-in.
 */
export function createReadSilentFetchApi(options: {
  fetchApi: FetchApi;
  silentFetchApi: FetchApi;
}): FetchApi {
  const { fetchApi, silentFetchApi } = options;
  return {
    fetch(input, init) {
      return (isRead(input, init) ? silentFetchApi : fetchApi).fetch(
        input,
        init,
      );
    },
  };
}

function isRead(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = (
    init?.method ??
    (input instanceof Request ? input.method : undefined) ??
    'GET'
  ).toUpperCase();
  if (method === 'GET' || method === 'HEAD') {
    return true;
  }
  if (method !== 'POST') {
    return false;
  }
  let url: string;
  if (typeof input === 'string') {
    url = input;
  } else if (input instanceof URL) {
    url = input.href;
  } else {
    url = input.url;
  }
  return new URL(url, 'http://localhost').pathname.endsWith(
    '/entities/by-refs',
  );
}
