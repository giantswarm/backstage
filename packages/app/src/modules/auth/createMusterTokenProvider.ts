import { ConfigApi } from '@backstage/core-plugin-api';
import { gsAuthProvidersApiRef } from '@giantswarm/backstage-plugin-gs';

const SUBJECT_TOKEN_HEADER = 'gs-subject-token';

/**
 * Returns a function that mints a muster-signed session token from the user's
 * main Dex ID token through the backend's `/api/auth/muster-token` route, or
 * undefined when muster's token endpoint is not configured
 * (`gs.musterToken.tokenUrl`), in which case callers keep forwarding the raw
 * main Dex ID token.
 *
 * The minted token replaces the raw Dex ID token as the MCP bearer so that
 * muster's outbound exchange, which only accepts a muster-signed subject,
 * succeeds. Minting targets the deployment's local muster; a token minted
 * elsewhere would not be trusted here.
 */
export function createMusterTokenProvider(
  gsAuthProvidersApi: typeof gsAuthProvidersApiRef.T,
  configApi: ConfigApi,
): (() => Promise<string | undefined>) | undefined {
  const tokenUrl = configApi.getOptionalString('gs.musterToken.tokenUrl');
  if (!tokenUrl) {
    return undefined;
  }

  // The muster token route is served by the main backend, not by
  // per-installation backend overrides.
  const backendBaseUrl = configApi.getString('backend.baseUrl');

  return async () => {
    const mainAuthApi = gsAuthProvidersApi.getMainAuthApi();

    // The non-optional getters return silently when the main Dex session
    // exists and trigger the single main SSO login when it is gone.
    const idToken = await mainAuthApi.getIdToken();
    const identity = await mainAuthApi.getBackstageIdentity();
    if (!idToken || !identity) {
      return undefined;
    }

    const response = await fetch(`${backendBaseUrl}/api/auth/muster-token`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${identity.token}`,
        [SUBJECT_TOKEN_HEADER]: idToken,
      },
    });
    if (!response.ok) {
      throw new Error(`Muster token request failed: ${response.status}`);
    }

    const { token } = await response.json();
    return token;
  };
}
