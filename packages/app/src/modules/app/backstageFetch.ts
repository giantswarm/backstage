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
import { SESSION_EXPIRED_MESSAGE } from '@giantswarm/backstage-plugin-kubernetes-react';

type MainAuthApi = BackstageIdentityApi & SessionApi;

/**
 * The portal's fetch: `plugin://` URLs resolved through discovery, and the
 * person's Backstage token sent as `X-Backstage-Token` to the portal's own
 * backends.
 *
 * A request may open the sign-in (Login Required) only when a person started
 * it: while the page has a user gesture (`navigator.userActivation`), the
 * token takes the app identity's interactive path; a request a timer, a poll
 * or a refetch sends takes the live session's token or fails as
 * session-expired ({@link silentIdentity}), without prompting.
 */
export function createBackstageFetchApi(options: {
  configApi: ConfigApi;
  discoveryApi: DiscoveryApi;
  identityApi: IdentityApi;
  mainAuthApi: MainAuthApi | undefined;
  hasUserGesture?: () => boolean;
}): FetchApi {
  const { configApi, discoveryApi, identityApi, mainAuthApi } = options;
  return createFetchApi({
    middleware: [
      FetchMiddlewares.resolvePluginProtocol({ discoveryApi }),
      FetchMiddlewares.injectIdentityAuth({
        identityApi: gestureAwareIdentity({
          identityApi,
          silentIdentityApi: silentIdentity({ identityApi, mainAuthApi }),
          hasUserGesture: options.hasUserGesture ?? hasUserGesture,
        }),
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
 * Whether the page has a user gesture (a click, a key press) recent enough to
 * open a popup: the person started what runs now. A browser without the API
 * counts as yes, which keeps the interactive path it always had.
 */
export function hasUserGesture(): boolean {
  return navigator.userActivation?.isActive ?? true;
}

/** The app identity, its credentials silent unless a person acts. */
function gestureAwareIdentity(options: {
  identityApi: IdentityApi;
  silentIdentityApi: IdentityApi;
  hasUserGesture: () => boolean;
}): IdentityApi {
  const { identityApi, silentIdentityApi } = options;
  return {
    ...delegate(identityApi),
    getCredentials: () =>
      options.hasUserGesture()
        ? identityApi.getCredentials()
        : silentIdentityApi.getCredentials(),
  };
}

/**
 * Thrown by a silent request when the portal session is gone, before it is
 * sent. Its message is the portal's {@link SESSION_EXPIRED_MESSAGE}, which
 * `isSessionExpiredError` recognises.
 */
export class PortalSessionExpiredError extends Error {
  constructor() {
    super(SESSION_EXPIRED_MESSAGE);
    this.name = 'PortalSessionExpiredError';
  }
}

/**
 * The app identity, its credentials from the live portal session only: the
 * main login provider's optional path, which refreshes the session silently
 * where it can and otherwise answers "none" instead of opening the sign-in.
 * Without a session it throws {@link PortalSessionExpiredError}.
 *
 * - It waits for the sign-in like the app identity does (its
 *   `getBackstageIdentity` resolves once the sign-in page set the identity,
 *   from what the sign-in already holds).
 * - Once the session is found gone, requests fail at once, without another
 *   refresh round trip each, until the provider reports a session again (a
 *   sign-in the person starts).
 * - Without a main login provider (`gs.authProvider` unset: the guest sign-in
 *   of local development, whose credentials never prompt) the app identity
 *   serves as it is.
 */
export function silentIdentity(options: {
  identityApi: IdentityApi;
  mainAuthApi: MainAuthApi | undefined;
}): IdentityApi {
  const { identityApi, mainAuthApi } = options;
  let expired = false;
  mainAuthApi?.sessionState$().subscribe(state => {
    if (state === SessionState.SignedIn) {
      expired = false;
    }
  });
  return {
    ...delegate(identityApi),
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

function delegate(identityApi: IdentityApi): IdentityApi {
  return {
    getProfileInfo: () => identityApi.getProfileInfo(),
    getBackstageIdentity: () => identityApi.getBackstageIdentity(),
    getCredentials: () => identityApi.getCredentials(),
    signOut: () => identityApi.signOut(),
  };
}
