import {
  createApiRef,
  OAuthApi,
  OpenIdConnectApi,
} from '@backstage/core-plugin-api';
import { MusterAuthCredentials, MusterAuthProvidersApi } from './types';

export const musterAuthProvidersApiRef = createApiRef<MusterAuthProvidersApi>({
  id: 'plugin.muster.auth-providers',
});

/**
 * Maps auth provider names to OAuthApi instances, mirroring ai-chat's
 * MCPAuthProviders. The app wires this up with the gs auth providers'
 * MCP auth APIs and main auth API.
 */
export class MusterAuthProviders implements MusterAuthProvidersApi {
  private readonly authProviders: { [providerName: string]: OAuthApi };
  private readonly mainAuthApi?: OpenIdConnectApi;
  private readonly musterTokenProvider?: () => Promise<string | undefined>;

  /**
   * @param authProviders - Dedicated OAuth providers, keyed by `authProvider`
   *   name. Each yields its own access token (legacy per-server PKCE login).
   * @param mainAuthApi - Optional fallback for provider names without a
   *   dedicated entry: the user's main identity provider, whose ID token is
   *   forwarded as the bearer token (single sign-on, no separate login).
   * @param musterTokenProvider - Optional minter of a muster-signed session
   *   token from the main Dex ID token. When set (`gs.musterToken.tokenUrl`
   *   configured), a provider name without a dedicated entry gets the
   *   muster-signed token instead of the raw main Dex ID token, so muster's
   *   outbound exchange accepts it. Minting failure is fail-closed (no token),
   *   not a fall back to the raw token. The token targets the local muster;
   *   remote installations in the management UI keep failing on their own Dex.
   */
  constructor(
    authProviders: { [providerName: string]: OAuthApi } = {},
    mainAuthApi?: OpenIdConnectApi,
    musterTokenProvider?: () => Promise<string | undefined>,
  ) {
    this.authProviders = authProviders;
    this.mainAuthApi = mainAuthApi;
    this.musterTokenProvider = musterTokenProvider;
  }

  async getCredentials(authProvider: string): Promise<MusterAuthCredentials> {
    const authApi = this.authProviders[authProvider];
    if (!authApi) {
      return this.getMainCredentials();
    }

    try {
      const token = await authApi.getAccessToken();
      return { token };
    } catch {
      return {};
    }
  }

  private async getMainCredentials(): Promise<MusterAuthCredentials> {
    if (this.musterTokenProvider) {
      try {
        const token = await this.musterTokenProvider();
        return token ? { token } : {};
      } catch {
        return {};
      }
    }

    if (!this.mainAuthApi) {
      return {};
    }

    try {
      const token = await this.mainAuthApi.getIdToken();
      return { token };
    } catch {
      return {};
    }
  }
}
