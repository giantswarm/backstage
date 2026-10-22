import {
  createApiRef,
  OAuthApi,
  OpenIdConnectApi,
} from '@backstage/core-plugin-api';
import {
  MusterAuthCredentials,
  MusterAuthCredentialsOptions,
  MusterAuthProvidersApi,
} from './types';

/**
 * The portal's main auth API also hands out an ID token with a share of its
 * lifetime still ahead (gs's `LastingAuthApi`), refreshing the session
 * silently for it.
 */
type LastingIdTokenApi = {
  getLastingIdToken(
    minLifetimeLeft: number,
    request?: { optional?: boolean },
  ): Promise<string>;
};

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

  async getCredentials(
    authProvider: string,
    options: MusterAuthCredentialsOptions = {},
  ): Promise<MusterAuthCredentials> {
    const authApi = this.authProviders[authProvider];
    if (!authApi) {
      return this.getMainCredentials(options);
    }

    try {
      const token = await authApi.getAccessToken(undefined, {
        optional: options.optional,
      });
      return token ? { token } : {};
    } catch {
      return {};
    }
  }

  private async getMainCredentials(
    options: MusterAuthCredentialsOptions,
  ): Promise<MusterAuthCredentials> {
    if (!this.mainAuthApi) {
      return {};
    }

    const request = { optional: options.optional };
    const lasting = this.mainAuthApi as OpenIdConnectApi &
      Partial<LastingIdTokenApi>;
    try {
      const token =
        options.minLifetimeLeft !== undefined && lasting.getLastingIdToken
          ? await lasting.getLastingIdToken(options.minLifetimeLeft, request)
          : await this.mainAuthApi.getIdToken(request);
      return token ? { token } : {};
    } catch {
      return {};
    }
  }
}
