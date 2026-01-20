import { OAuth2, OAuth2Session } from '@backstage/core-app-api';
import { ConfigApi, OAuthRequestApi } from '@backstage/core-plugin-api';
import {
  AuthApi,
  AuthProvider,
  GSAuthProvidersApi,
  GSAuthProvidersApiCreateOptions,
  gsAuthProvidersApiRef,
} from './types';
import { GiantSwarmIcon } from '../../assets/icons/CustomIcons';
import { DefaultAuthConnector } from './DefaultAuthConnector';
import { DiscoveryApiClient } from '../discovery/DiscoveryApiClient';

const OIDC_PROVIDER_NAME_PREFIX = 'oidc-';

/**
 * A client for authenticating towards Giant Swarm Management APIs.
 *
 * @public
 */
export class GSAuthProviders implements GSAuthProvidersApi {
  private readonly configApi?: ConfigApi;
  private readonly discoveryApi: DiscoveryApiClient;
  private readonly oauthRequestApi: OAuthRequestApi;
  // private readonly authProviders: AuthProvider[];
  // private readonly authApis: { [providerName: string]: AuthApi };
  private readonly kubernetesAuthProviders: AuthProvider[];
  private readonly kubernetesAuthApis: { [providerName: string]: AuthApi };

  private readonly mcpAuthProviders: AuthProvider[];
  private readonly mcpAuthApis: { [providerName: string]: AuthApi };

  constructor(options: GSAuthProvidersApiCreateOptions) {
    this.configApi = options.configApi;
    this.discoveryApi = options.discoveryApi;
    this.oauthRequestApi = options.oauthRequestApi;

    this.kubernetesAuthProviders = this.getKubernetesAuthProvidersFromConfig();
    this.kubernetesAuthApis = this.createKubernetesAuthApis();

    this.mcpAuthProviders = this.getMCPAuthProvidersFromConfig();
    this.mcpAuthApis = this.createMCPAuthApis();
  }

  static create(
    options: GSAuthProvidersApiCreateOptions,
  ): typeof gsAuthProvidersApiRef.T {
    return new GSAuthProviders(options);
  }

  private getKubernetesAuthProvidersFromConfig(): AuthProvider[] {
    const installationsConfig =
      this.configApi?.getOptionalConfig('gs.installations');
    if (!installationsConfig) {
      return [];
    }

    const installationNames = installationsConfig.keys();
    return installationNames.map(installationName => {
      const installationConfig =
        installationsConfig.getConfig(installationName);
      const authProvider = installationConfig.getString('authProvider');
      if (!authProvider || authProvider !== 'oidc') {
        throw new Error(
          `OIDC auth provider is not configured for installation "${installationName}".`,
        );
      }
      const oidcTokenProvider =
        installationConfig.getOptionalString('oidcTokenProvider');

      if (
        !oidcTokenProvider ||
        !oidcTokenProvider.startsWith(OIDC_PROVIDER_NAME_PREFIX)
      ) {
        throw new Error(
          `OIDC token provider is not configured for installation "${installationName}".`,
        );
      }

      const providerDisplayName = oidcTokenProvider.split(
        OIDC_PROVIDER_NAME_PREFIX,
      )[1];

      return {
        providerName: oidcTokenProvider,
        providerDisplayName,
        installationName,
      };
    });
  }

  private createKubernetesAuthApis() {
    const entries = this.kubernetesAuthProviders.map(
      ({ providerName, providerDisplayName }) => {
        const authConnector = new DefaultAuthConnector({
          configApi: this.configApi,
          discoveryApi: this.discoveryApi,
          oauthRequestApi: this.oauthRequestApi,
          environment:
            this.configApi?.getOptionalString('auth.environment') ??
            'development',
          provider: {
            id: providerName,
            title: providerDisplayName,
            icon: GiantSwarmIcon,
          },
          sessionTransform({ backstageIdentity, ...res }): OAuth2Session {
            const session: OAuth2Session = {
              ...res,
              providerInfo: {
                idToken: res.providerInfo.idToken,
                accessToken: res.providerInfo.accessToken,
                scopes: OAuth2.normalizeScopes(res.providerInfo.scope),
                expiresAt: res.providerInfo.expiresInSeconds
                  ? new Date(
                      Date.now() + res.providerInfo.expiresInSeconds * 1000,
                    )
                  : undefined,
              },
            };
            if (backstageIdentity) {
              session.backstageIdentity = {
                token: backstageIdentity.token,
                identity: backstageIdentity.identity,
                expiresAt: backstageIdentity.expiresInSeconds
                  ? new Date(
                      Date.now() + backstageIdentity.expiresInSeconds * 1000,
                    )
                  : undefined,
              };
            }
            return session;
          },
          popupOptions: {
            size: {
              width: 600,
              height: 600,
            },
          },
        });

        return [
          providerName,
          OAuth2.create({
            authConnector,
            defaultScopes: [
              'openid',
              'profile',
              'email',
              'groups',
              'offline_access',
              'federated:id',
              'audience:server:client_id:dex-k8s-authenticator',
            ],
          }),
        ];
      },
    );

    return Object.fromEntries(entries);
  }

  private getMCPAuthProvidersFromConfig(): AuthProvider[] {
    return [
      {
        providerName: 'mcp-kubernetes-graveler',
        providerDisplayName: 'Kubernetes MCP - graveler',
        installationName: 'graveler',
      },
    ];
  }

  private createMCPAuthApis() {
    const entries = this.mcpAuthProviders.map(
      ({ providerName, providerDisplayName }) => {
        const authConnector = new DefaultAuthConnector({
          configApi: this.configApi,
          discoveryApi: this.discoveryApi,
          oauthRequestApi: this.oauthRequestApi,
          environment:
            this.configApi?.getOptionalString('auth.environment') ??
            'development',
          provider: {
            id: providerName,
            title: providerDisplayName,
            icon: GiantSwarmIcon,
          },
          sessionTransform({ backstageIdentity, ...res }): OAuth2Session {
            const session: OAuth2Session = {
              ...res,
              providerInfo: {
                idToken: res.providerInfo.idToken,
                accessToken: res.providerInfo.accessToken,
                scopes: OAuth2.normalizeScopes(res.providerInfo.scope),
                expiresAt: res.providerInfo.expiresInSeconds
                  ? new Date(
                      Date.now() + res.providerInfo.expiresInSeconds * 1000,
                    )
                  : undefined,
              },
            };
            if (backstageIdentity) {
              session.backstageIdentity = {
                token: backstageIdentity.token,
                identity: backstageIdentity.identity,
                expiresAt: backstageIdentity.expiresInSeconds
                  ? new Date(
                      Date.now() + backstageIdentity.expiresInSeconds * 1000,
                    )
                  : undefined,
              };
            }
            return session;
          },
          popupOptions: {
            size: {
              width: 600,
              height: 600,
            },
          },
        });

        return [
          providerName,
          OAuth2.create({
            authConnector,
            defaultScopes: [
              'openid',
              'profile',
              'email',
              'groups',
              'offline_access',
              'federated:id',
              'audience:server:client_id:dex-k8s-authenticator',
            ],
          }),
        ];
      },
    );

    return Object.fromEntries(entries);
  }

  getProviders() {
    return [...this.kubernetesAuthProviders, ...this.mcpAuthProviders];
  }

  getAuthApi(providerName: string) {
    return (
      this.kubernetesAuthApis[providerName] || this.mcpAuthApis[providerName]
    );
  }

  getMainAuthApi() {
    const authProviderName =
      this.configApi?.getOptionalString('gs.authProvider');

    if (!authProviderName) {
      throw new Error(
        'No main auth provider configured. "gs.authProvider" configuration is missing.',
      );
    }

    const authApi = this.getAuthApi(authProviderName);

    if (!authApi) {
      throw new Error(
        `Auth provider with name "${authProviderName}" is not configured.`,
      );
    }

    return authApi;
  }

  getKubernetesAuthApis() {
    return this.kubernetesAuthApis;
  }
}
