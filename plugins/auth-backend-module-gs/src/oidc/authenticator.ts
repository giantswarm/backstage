import { AuthenticationError } from '@backstage/errors';
import { OAuthAuthenticator } from '@backstage/plugin-auth-node';
import {
  oidcAuthenticator,
  OidcAuthResult,
} from '@backstage/plugin-auth-backend-module-oidc-provider';

type OidcContext = ReturnType<typeof oidcAuthenticator.initialize>;
type DiscoveryPromise = OidcContext['promise'];

/**
 * Dex's `connector_id` authorization parameter: it skips Dex's connector
 * picker and sends the user straight to one upstream identity provider.
 *
 * A deployment pins its default connector with the upstream
 * `startUrlSearchParams.connector_id` provider setting; a sign-in request may
 * ask for another one by passing the same parameter on `/start`, which is how
 * the login page offers a fallback connector next to the default.
 */
export const CONNECTOR_ID_PARAM = 'connector_id';

/** Dex connector ids are plain identifiers; anything else is ignored. */
const CONNECTOR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * The Dex connector a sign-in request asks for via the `/start` query, or
 * undefined when the request carries none (or a malformed one).
 */
export function requestedConnectorId(req: {
  query?: unknown;
}): string | undefined {
  const query = req.query as Record<string, unknown> | undefined;
  const value = query?.[CONNECTOR_ID_PARAM];
  if (typeof value !== 'string' || !CONNECTOR_ID_PATTERN.test(value)) {
    return undefined;
  }
  return value;
}

/**
 * The upstream oidc authenticator performs issuer discovery once in
 * initialize() and every request awaits that same promise, so a single failed
 * discovery (e.g. Dex briefly unreachable right after startup) is cached for
 * the lifetime of the process and permanently breaks login until the pod is
 * restarted.
 *
 * This wrapper memoizes discovery only on success: while discovery keeps
 * failing, each login attempt triggers a fresh one, and login recovers as
 * soon as the issuer is reachable again. Concurrent requests share the
 * in-flight attempt, so a flapping issuer is not hammered.
 *
 * It also lets a sign-in request choose the Dex connector: a `connector_id`
 * on `/start` replaces the configured default for that authorization request
 * (see {@link requestedConnectorId}).
 *
 * And it refuses to refresh a session with fewer scopes than the request asks
 * for (see `refresh`), so a widened `gs.auth.extraScopes` makes existing
 * sessions sign in again instead of forwarding a token that lacks the new
 * scopes.
 */
export const gsOidcAuthenticator: OAuthAuthenticator<
  OidcContext,
  OidcAuthResult
> = {
  ...oidcAuthenticator,
  initialize(input) {
    let discovery: DiscoveryPromise | undefined;

    const track = (promise: DiscoveryPromise): DiscoveryPromise => {
      const attempt: DiscoveryPromise = promise.catch(err => {
        if (discovery === attempt) {
          discovery = undefined;
        }
        throw err;
      });
      // The rejection reaches whichever request awaits the promise; this
      // no-op handler only prevents an unhandled rejection when the failure
      // happens before any request is in flight.
      attempt.catch(() => {});
      return attempt;
    };

    // Initialize eagerly so config errors still fail startup, and use the
    // resulting discovery as the first attempt.
    const ctx = oidcAuthenticator.initialize(input);
    discovery = track(ctx.promise);

    return {
      initializedPrompt: ctx.initializedPrompt,
      searchParams: ctx.searchParams,
      get promise() {
        if (!discovery) {
          discovery = track(oidcAuthenticator.initialize(input).promise);
        }
        return discovery;
      },
    };
  },
  async start(input, ctx) {
    const connectorId = requestedConnectorId(input.req);
    if (!connectorId) {
      return oidcAuthenticator.start(input, ctx);
    }
    // Pin the connector for this request only; the context keeps its lazy
    // discovery getter, so the retry semantics above are unchanged.
    const pinned: OidcContext = {
      initializedPrompt: ctx.initializedPrompt,
      searchParams: { ...ctx.searchParams, [CONNECTOR_ID_PARAM]: connectorId },
      get promise() {
        return ctx.promise;
      },
    };
    return oidcAuthenticator.start(input, pinned);
  },
  async refresh(input, ctx) {
    // A refresh never widens a grant: the issuer re-issues the tokens with the
    // scopes the sign-in consented to, whatever the refresh asks for (Dex
    // issues the new ID token from the refresh token's own scopes). The OAuth
    // adapter persists the granted scopes in a cookie next to the refresh
    // token and says here whether the request stays within them. The upstream
    // authenticator ignores that flag; the adapter then records the *requested*
    // set as granted and reports it to the frontend, which treats scopes the
    // token never carried as present. After `gs.auth.extraScopes` gained the
    // `audience:server:client_id:*` scope the apiservers require, every
    // existing session kept forwarding an ID token without that audience and
    // every Kubernetes read failed with 401 until the person signed out by
    // hand. Refusing is what keeps the session honest: the frontend's session
    // manager drops the session and starts a fresh sign-in, which requests the
    // widened set.
    if (input.scopeAlreadyGranted === false) {
      throw new AuthenticationError(
        'The session was signed in with fewer scopes than this refresh asks for; a refresh cannot widen the grant, so the person has to sign in again.',
      );
    }
    return oidcAuthenticator.refresh(input, ctx);
  },
};
