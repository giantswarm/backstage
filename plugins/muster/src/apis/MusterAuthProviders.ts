import { createApiRef, OAuthApi } from '@backstage/core-plugin-api';
import { MusterAuthCredentials, MusterAuthProvidersApi } from './types';

export const musterAuthProvidersApiRef = createApiRef<MusterAuthProvidersApi>({
  id: 'plugin.muster.auth-providers',
});

/**
 * Maps auth provider names to OAuthApi instances, mirroring ai-chat's
 * MCPAuthProviders. The app wires this up with the gs auth providers'
 * MCP auth APIs.
 */
export class MusterAuthProviders implements MusterAuthProvidersApi {
  private readonly authProviders: { [providerName: string]: OAuthApi };

  constructor(authProviders: { [providerName: string]: OAuthApi } = {}) {
    this.authProviders = authProviders;
  }

  async getCredentials(authProvider: string): Promise<MusterAuthCredentials> {
    const authApi = this.authProviders[authProvider];
    if (!authApi) {
      return {};
    }

    try {
      const token = await authApi.getAccessToken();
      return { token };
    } catch {
      return {};
    }
  }
}
