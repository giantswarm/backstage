import { OAuthApi } from '@backstage/core-plugin-api';
import { MCPAuthProvidersApi, MCPAuthCredentials } from './types';

export class MCPAuthProviders implements MCPAuthProvidersApi {
  private readonly authProviders: { [providerName: string]: OAuthApi };

  constructor(authProviders: { [providerName: string]: OAuthApi } = {}) {
    this.authProviders = authProviders;
  }

  async getCredentials(authProvider: string): Promise<MCPAuthCredentials> {
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
