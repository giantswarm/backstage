import {
  asLoginRequestCallerApi,
  gsAuthProvidersApiRef,
  type LoginRequestCaller,
} from '@giantswarm/backstage-plugin-gs';

/**
 * Resolves the main auth API as `caller` uses it, so a sign-in it opens names
 * the caller (`data-login-requested-by`), or undefined when no main auth
 * provider is configured (`gs.authProvider` unset), in which case MCP
 * servers require dedicated auth providers.
 */
export function getOptionalMainAuthApi(
  gsAuthProvidersApi: typeof gsAuthProvidersApiRef.T,
  caller: LoginRequestCaller,
) {
  try {
    return asLoginRequestCallerApi(caller, gsAuthProvidersApi.getMainAuthApi());
  } catch {
    return undefined;
  }
}
