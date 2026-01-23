import { OAuth2, OAuth2Session } from '@backstage/core-app-api';
import {
  ConfigApi,
  DiscoveryApi,
  OAuthApi,
  OAuthRequestApi,
} from '@backstage/core-plugin-api';
import { MCPAuthApi, MCPAuthApiCreateOptions, McpServer } from './types';

const MCP_PROVIDER_PREFIX = 'mcp-';

/**
 * Creates an OAuth connector for MCP servers.
 *
 * This is a simplified version of DefaultAuthConnector that works
 * with the MCP OAuth providers registered by auth-backend-module-mcp.
 */
class McpAuthConnector {
  private readonly discoveryApi: DiscoveryApi;
  private readonly oauthRequestApi: OAuthRequestApi;
  private readonly providerId: string;
  private readonly environment: string;

  constructor(options: {
    discoveryApi: DiscoveryApi;
    oauthRequestApi: OAuthRequestApi;
    providerId: string;
    environment: string;
  }) {
    this.discoveryApi = options.discoveryApi;
    this.oauthRequestApi = options.oauthRequestApi;
    this.providerId = options.providerId;
    this.environment = options.environment;
  }

  async createSession(options: {
    scopes: Set<string>;
    instantPopup?: boolean;
  }): Promise<OAuth2Session> {
    if (options.instantPopup) {
      return this.showPopup(options.scopes);
    }

    // Create an auth requester that shows popup on demand
    return new Promise((resolve, reject) => {
      const requester = this.oauthRequestApi.createAuthRequester({
        provider: {
          id: this.providerId,
          title: this.providerId.replace(MCP_PROVIDER_PREFIX, ''),
          icon: () => null,
        },
        onAuthRequest: async scopes => {
          try {
            const session = await this.showPopup(scopes);
            return session;
          } catch (error) {
            throw error;
          }
        },
      });

      requester(options.scopes).then(resolve).catch(reject);
    });
  }

  async refreshSession(options?: {
    scopes: Set<string>;
  }): Promise<OAuth2Session> {
    const res = await fetch(
      await this.buildUrl('/refresh', {
        optional: true,
        ...(options && { scope: [...options.scopes].join(' ') }),
      }),
      {
        headers: {
          'x-requested-with': 'XMLHttpRequest',
        },
        credentials: 'include',
      },
    );

    if (!res.ok) {
      const error: any = new Error(
        `Auth refresh request failed: ${res.statusText}`,
      );
      error.status = res.status;
      throw error;
    }

    const authInfo = await res.json();

    if (authInfo.error) {
      const error = new Error(authInfo.error.message);
      if (authInfo.error.name) {
        error.name = authInfo.error.name;
      }
      throw error;
    }

    return this.transformSession(authInfo);
  }

  async removeSession(): Promise<void> {
    const res = await fetch(await this.buildUrl('/logout'), {
      method: 'POST',
      headers: {
        'x-requested-with': 'XMLHttpRequest',
      },
      credentials: 'include',
    });

    if (!res.ok) {
      const error: any = new Error(`Logout request failed: ${res.statusText}`);
      error.status = res.status;
      throw error;
    }
  }

  private async showPopup(scopes: Set<string>): Promise<OAuth2Session> {
    const scope = [...scopes].join(' ');
    const popupUrl = await this.buildUrl('/start', {
      scope,
      origin: window.location.origin,
      flow: 'popup',
    });

    // Open popup window
    const width = 500;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      popupUrl,
      `MCP Login - ${this.providerId}`,
      `width=${width},height=${height},left=${left},top=${top}`,
    );

    if (!popup) {
      throw new Error('Failed to open login popup - popup may be blocked');
    }

    // Wait for popup to complete
    return new Promise((resolve, reject) => {
      const messageHandler = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) {
          return;
        }

        if (event.data?.type === 'authorization_response') {
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          cleanup();

          if (event.data.error) {
            reject(
              new Error(event.data.error.message || 'Authentication failed'),
            );
          } else {
            resolve(this.transformSession(event.data.response));
          }
        }
      };

      // Poll to check if popup was closed without completing
      const pollInterval = setInterval(() => {
        if (popup.closed) {
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          cleanup();
          reject(new Error('Login popup was closed'));
        }
      }, 500);

      const cleanup = () => {
        window.removeEventListener('message', messageHandler);
        clearInterval(pollInterval);
      };

      window.addEventListener('message', messageHandler);
    });
  }

  private transformSession(response: any): OAuth2Session {
    return {
      ...response,
      providerInfo: {
        idToken: response.providerInfo?.idToken,
        accessToken: response.providerInfo?.accessToken,
        scopes: OAuth2.normalizeScopes(response.providerInfo?.scope),
        expiresAt: response.providerInfo?.expiresInSeconds
          ? new Date(Date.now() + response.providerInfo.expiresInSeconds * 1000)
          : undefined,
      },
    };
  }

  private async buildUrl(
    path: string,
    query?: Record<string, string | boolean | undefined>,
  ): Promise<string> {
    const baseUrl = await this.discoveryApi.getBaseUrl('auth');
    const queryString = this.buildQueryString({
      ...query,
      env: this.environment,
    });

    return `${baseUrl}/${this.providerId}${path}${queryString}`;
  }

  private buildQueryString(
    query?: Record<string, string | boolean | undefined>,
  ): string {
    if (!query) {
      return '';
    }

    const params = Object.entries(query)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        if (typeof value === 'string') {
          return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
        } else if (value) {
          return encodeURIComponent(key);
        }
        return undefined;
      })
      .filter(Boolean)
      .join('&');

    return params ? `?${params}` : '';
  }
}

/**
 * Implementation of MCPAuthApi that manages OAuth authentication
 * for MCP servers.
 */
export class MCPAuthProviders implements MCPAuthApi {
  private readonly servers: McpServer[];
  private readonly authApis: Record<string, OAuthApi>;

  constructor(options: MCPAuthApiCreateOptions) {
    this.servers = options.servers;
    this.authApis = options.authApis;
  }

  /**
   * Create an MCPAuthProviders instance from Backstage APIs.
   *
   * Discovers MCP providers from auth.providers configuration by looking
   * for providers with 'mcp-' prefix.
   */
  static create(options: {
    configApi: ConfigApi;
    discoveryApi: DiscoveryApi;
    oauthRequestApi: OAuthRequestApi;
  }): MCPAuthApi {
    const { configApi, discoveryApi, oauthRequestApi } = options;

    // Read MCP providers from auth.providers config
    const providersConfig = configApi.getOptionalConfig('auth.providers');
    const environment =
      configApi.getOptionalString('auth.environment') ?? 'development';

    const servers: McpServer[] = [];
    const authApis: Record<string, OAuthApi> = {};

    const allProviders = providersConfig?.keys() ?? [];
    const mcpProviderIds = allProviders.filter(p =>
      p.startsWith(MCP_PROVIDER_PREFIX),
    );

    for (const providerId of mcpProviderIds) {
      const providerConfig = providersConfig
        ?.getConfig(providerId)
        ?.getOptionalConfig(environment);

      if (!providerConfig) {
        continue;
      }

      // Extract server name from providerId (remove mcp- prefix)
      const name = providerId.replace(MCP_PROVIDER_PREFIX, '');
      const displayName =
        providerConfig.getOptionalString('displayName') ?? name;

      servers.push({
        name,
        displayName,
        requiresAuth: true,
        providerId,
      });

      // Create OAuth API for this server
      const connector = new McpAuthConnector({
        discoveryApi,
        oauthRequestApi,
        providerId,
        environment,
      });

      authApis[name] = OAuth2.create({
        authConnector: connector,
        defaultScopes: providerConfig.getOptionalStringArray('scopes') ?? [],
      });
    }

    return new MCPAuthProviders({ servers, authApis });
  }

  async getServers(): Promise<McpServer[]> {
    return this.servers;
  }

  getAuthApi(serverName: string): OAuthApi | undefined {
    return this.authApis[serverName];
  }

  async getAccessToken(serverName: string): Promise<string> {
    const authApi = this.authApis[serverName];
    if (!authApi) {
      throw new Error(`MCP server "${serverName}" not found or not configured`);
    }

    const token = await authApi.getAccessToken();
    return token;
  }

  async isAuthenticated(serverName: string): Promise<boolean> {
    const authApi = this.authApis[serverName];
    if (!authApi) {
      return false;
    }

    try {
      // Try to get a token without triggering auth flow
      // If it succeeds, we're authenticated
      await authApi.getAccessToken();
      return true;
    } catch {
      return false;
    }
  }

  async signOut(serverName: string): Promise<void> {
    const authApi = this.authApis[serverName];
    if (authApi && 'signOut' in authApi) {
      await (authApi as any).signOut();
    }
  }
}
