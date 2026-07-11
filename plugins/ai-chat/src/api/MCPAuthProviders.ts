import { OAuthApi, OpenIdConnectApi } from '@backstage/core-plugin-api';
import { MCPAuthProvidersApi, MCPAuthCredentials } from './types';

export class MCPAuthProviders implements MCPAuthProvidersApi {
  private readonly authProviders: { [providerName: string]: OAuthApi };
  private readonly mainAuthApi?: OpenIdConnectApi;
  private readonly musterTokenProvider?: () => Promise<string | undefined>;

  /**
   * @param authProviders - Dedicated OAuth providers, keyed by the
   *   `authProvider` name used in `aiChat.mcp` config. Each yields its own
   *   access token (legacy per-server PKCE login).
   * @param mainAuthApi - Optional fallback for provider names without a
   *   dedicated entry: the user's main identity provider, whose ID token is
   *   forwarded as the MCP bearer token. This enables single sign-on for MCP
   *   servers (e.g. muster) that trust the main issuer, without a separate
   *   login.
   * @param musterTokenProvider - Optional minter of a muster-signed session
   *   token from the main Dex ID token. When set (`gs.musterToken.tokenUrl`
   *   configured), a provider name without a dedicated entry gets the
   *   muster-signed token instead of the raw main Dex ID token, so muster's
   *   outbound exchange accepts it. Minting failure is fail-closed (no token),
   *   not a fall back to the raw token.
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

  async getCredentials(authProvider: string): Promise<MCPAuthCredentials> {
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

  private async getMainCredentials(): Promise<MCPAuthCredentials> {
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
