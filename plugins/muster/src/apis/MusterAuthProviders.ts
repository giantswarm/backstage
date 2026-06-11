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

  /**
   * @param authProviders - Dedicated OAuth providers, keyed by `authProvider`
   *   name. Each yields its own access token (legacy per-server PKCE login).
   * @param mainAuthApi - Optional fallback for provider names without a
   *   dedicated entry: the user's main identity provider, whose ID token is
   *   forwarded as the bearer token (single sign-on, no separate login).
   */
  constructor(
    authProviders: { [providerName: string]: OAuthApi } = {},
    mainAuthApi?: OpenIdConnectApi,
  ) {
    this.authProviders = authProviders;
    this.mainAuthApi = mainAuthApi;
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
