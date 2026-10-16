import { createFetchApi, FetchMiddlewares } from '@backstage/core-app-api';
import {
  type BackstageIdentityApi,
  type ConfigApi,
  type DiscoveryApi,
  type FetchApi,
  type IdentityApi,
  type SessionApi,
  SessionState,
} from '@backstage/core-plugin-api';
import { GSDiscoveryApiClient } from '@giantswarm/backstage-plugin-gs';

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
  identityApi: IdentityApi;
}): FetchApi {
  const { configApi, discoveryApi, identityApi } = options;
  return createFetchApi({
    middleware: [
      FetchMiddlewares.resolvePluginProtocol({ discoveryApi }),
      FetchMiddlewares.injectIdentityAuth({
        identityApi,
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

/**
 * Thrown by a silent read when the portal session is gone, before any request
 * is sent. Its message is the portal's session-expired copy, which
 * `isSessionExpiredError` recognises.
 */
export class PortalSessionExpiredError extends Error {
  constructor() {
    super('Your session expired, sign in again.');
    this.name = 'PortalSessionExpiredError';
  }
}

/**
 * The app's identity, its credentials from the live portal session only: the
 * main login provider's optional path, which refreshes the session silently
 * where it can and otherwise answers "none" instead of opening the sign-in.
 * Without a session it throws {@link PortalSessionExpiredError}.
 *
 * - A read waits for the sign-in like the app's identity does (its
 *   `getBackstageIdentity` resolves once the sign-in page set the identity,
 *   from what the sign-in already holds).
 * - Once the session is found gone, reads fail at once, without another
 *   refresh round trip each, until the provider reports a session again (a
 *   sign-in the person starts).
 * - Without a main login provider (`gs.authProvider` unset: the guest sign-in
 *   of local development, whose credentials never prompt) the app's identity
 *   serves as it is.
 */
export function silentIdentity(options: {
  identityApi: IdentityApi;
  mainAuthApi: (BackstageIdentityApi & SessionApi) | undefined;
}): IdentityApi {
  const { identityApi, mainAuthApi } = options;
  let expired = false;
  mainAuthApi?.sessionState$().subscribe(state => {
    if (state === SessionState.SignedIn) {
      expired = false;
    }
  });
  return {
    getProfileInfo: () => identityApi.getProfileInfo(),
    getBackstageIdentity: () => identityApi.getBackstageIdentity(),
    signOut: () => identityApi.signOut(),
    async getCredentials() {
      if (!mainAuthApi) {
        return identityApi.getCredentials();
      }
      await identityApi.getBackstageIdentity();
      if (expired) {
        throw new PortalSessionExpiredError();
      }
      const identity = await mainAuthApi.getBackstageIdentity({
        optional: true,
      });
      if (!identity?.token) {
        expired = true;
        throw new PortalSessionExpiredError();
      }
      return { token: identity.token };
    },
  };
}

/** The catalog's reads that are POSTs: their filters go in the body. */
const POST_READ_PATHS = [
  '/entities/by-refs',
  '/entities/by-query',
  '/entity-facets',
  '/locations/by-query',
];

/**
 * Sends reads (GET, HEAD and the catalog's POST reads) through
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
      return (
        isRead(new Request(input, init)) ? silentFetchApi : fetchApi
      ).fetch(input, init);
    },
  };
}

function isRead(request: Request): boolean {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return true;
  }
  const { pathname } = new URL(request.url);
  return (
    request.method === 'POST' &&
    POST_READ_PATHS.some(path => pathname.endsWith(path))
  );
}
