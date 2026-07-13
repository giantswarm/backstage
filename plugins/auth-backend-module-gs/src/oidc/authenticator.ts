import { OAuthAuthenticator } from '@backstage/plugin-auth-node';
import {
  oidcAuthenticator,
  OidcAuthResult,
} from '@backstage/plugin-auth-backend-module-oidc-provider';

type OidcContext = ReturnType<typeof oidcAuthenticator.initialize>;
type DiscoveryPromise = OidcContext['promise'];

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
};
