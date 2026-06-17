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
import {
  ClusterToken,
  ClusterTokenError,
  ClusterTokenErrorReason,
  DefaultAuthConnector,
} from './DefaultAuthConnector';
import { DiscoveryApiClient } from '../discovery/DiscoveryApiClient';
import { ClusterAccessStatusApi } from '../clusterAccessStatus';

const OIDC_PROVIDER_NAME_PREFIX = 'oidc-';
const MCP_PROVIDER_NAME_PREFIX = 'mcp-';

const SUBJECT_TOKEN_HEADER = 'gs-subject-token';

/** Human-readable text shown in the cluster-access status popover. */
const CLUSTER_TOKEN_ERROR_MESSAGES: Record<ClusterTokenErrorReason, string> = {
  'session-expired': 'Your session expired -- sign in again',
  subject_invalid: 'Your session was rejected -- sign in again',
  broker_unreachable: 'Token broker is unreachable',
  exchange_failed: 'Token exchange failed',
  unknown: 'Cluster access failed',
};

const CLUSTER_TOKEN_ERROR_REASONS: ReadonlySet<string> = new Set([
  'broker_unreachable',
  'exchange_failed',
  'subject_invalid',
]);

/**
 * Maps a failed cluster-token backend response to a coarse, UI-facing reason.
 * Prefers the backend's explicit `reason` field (Phase 2 enrichment) and falls
 * back to the HTTP status when the body is unparseable or unknown.
 */
async function readClusterTokenErrorReason(
  response: Response,
): Promise<ClusterTokenErrorReason> {
  try {
    const body = (await response.json()) as { reason?: string };
    if (body.reason && CLUSTER_TOKEN_ERROR_REASONS.has(body.reason)) {
      return body.reason as ClusterTokenErrorReason;
    }
  } catch {
    // Body was not JSON or had no reason -- fall back to the status code.
  }
  return response.status >= 500 ? 'broker_unreachable' : 'exchange_failed';
}

/**
 * A client for authenticating towards Giant Swarm Management APIs.
 *
 * @public
 */
export class GSAuthProviders implements GSAuthProvidersApi {
  private readonly configApi?: ConfigApi;
  private readonly discoveryApi: DiscoveryApiClient;
  private readonly oauthRequestApi: OAuthRequestApi;

  private readonly kubernetesAuthProviders: AuthProvider[];
  private readonly kubernetesAuthApis: { [providerName: string]: AuthApi };

  private readonly mcpAuthProviders: AuthProvider[];
  private readonly mcpAuthApis: { [providerName: string]: AuthApi };

  private readonly clusterAccessStatusApi?: ClusterAccessStatusApi;

  constructor(options: GSAuthProvidersApiCreateOptions) {
    this.configApi = options.configApi;
    this.discoveryApi = options.discoveryApi;
    this.oauthRequestApi = options.oauthRequestApi;
    this.clusterAccessStatusApi = options.clusterAccessStatusApi;

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
        clusterTokenAudience: installationConfig.getOptionalString(
          'clusterTokenAudience',
        ),
      };
    });
  }

  /**
   * Returns a function that silently mints a per-cluster token through the
   * cluster token broker (the backend's /api/auth/cluster-token route), or
   * undefined when the broker path does not apply to this provider. The main
   * auth provider is excluded: its session is the broker's subject token.
   */
  private createClusterTokenProvider(
    installationName: string,
    providerName: string,
  ): (() => Promise<ClusterToken | undefined>) | undefined {
    if (!this.configApi) {
      return undefined;
    }
    const brokerConfigured = Boolean(
      this.configApi.getOptionalString('gs.clusterTokenBroker.tokenUrl'),
    );
    const mainProviderName =
      this.configApi.getOptionalString('gs.authProvider');
    if (
      !brokerConfigured ||
      !mainProviderName ||
      providerName === mainProviderName
    ) {
      return undefined;
    }

    // The cluster token route is served by the main backend, not by
    // per-installation backend overrides.
    const backendBaseUrl = this.configApi.getString('backend.baseUrl');
    const statusApi = this.clusterAccessStatusApi;

    const mint = async (): Promise<ClusterToken | undefined> => {
      const mainAuthApi = this.getMainAuthApi();

      // Auto re-auth: the non-optional getters return silently when the main
      // Dex session exists and trigger the single main SSO login when it is
      // gone -- the only popup a broker-backed cluster ever causes. A
      // declined/failed login surfaces as a typed session-expired error.
      let idToken: Awaited<ReturnType<typeof mainAuthApi.getIdToken>>;
      let identity: Awaited<
        ReturnType<typeof mainAuthApi.getBackstageIdentity>
      >;
      try {
        idToken = await mainAuthApi.getIdToken();
        identity = await mainAuthApi.getBackstageIdentity();
      } catch (error) {
        throw new ClusterTokenError(
          installationName,
          'session-expired',
          'Main session expired and re-login did not complete',
        );
      }
      if (!idToken || !identity) {
        throw new ClusterTokenError(installationName, 'session-expired');
      }

      let response: Response;
      try {
        response = await fetch(
          `${backendBaseUrl}/api/auth/cluster-token/${encodeURIComponent(
            installationName,
          )}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${identity.token}`,
              [SUBJECT_TOKEN_HEADER]: idToken,
            },
          },
        );
      } catch (error) {
        throw new ClusterTokenError(
          installationName,
          'broker_unreachable',
          `Cluster token request failed: ${error}`,
        );
      }
      if (!response.ok) {
        const reason = await readClusterTokenErrorReason(response);
        throw new ClusterTokenError(installationName, reason);
      }

      const { token, expiresInSeconds } = await response.json();
      if (!token) {
        throw new ClusterTokenError(installationName, 'exchange_failed');
      }
      return { token, expiresInSeconds };
    };

    return async () => {
      try {
        const clusterToken = await mint();
        statusApi?.recordHealthy(installationName);
        return clusterToken;
      } catch (error) {
        if (error instanceof ClusterTokenError) {
          const message = CLUSTER_TOKEN_ERROR_MESSAGES[error.reason];
          // A rejected/expired main session is fixed by the single SSO
          // re-login, so it is a session-expired state rather than a degraded
          // cluster.
          if (
            error.reason === 'session-expired' ||
            error.reason === 'subject_invalid'
          ) {
            statusApi?.recordSessionExpired(installationName, message);
          } else {
            statusApi?.recordDegraded(installationName, message);
          }
        }
        throw error;
      }
    };
  }

  private createKubernetesAuthApis() {
    const entries = this.kubernetesAuthProviders.map(
      ({ providerName, providerDisplayName, installationName }) => {
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
          clusterTokenProvider: this.createClusterTokenProvider(
            installationName,
            providerName,
          ),
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
    const authProvidersConfig =
      this.configApi?.getOptionalConfig('auth.providers');
    if (!authProvidersConfig) {
      return [];
    }

    const providerNames = authProvidersConfig.keys();
    return providerNames
      .filter(providerName => providerName.startsWith(MCP_PROVIDER_NAME_PREFIX))
      .map(providerName => {
        const providerDisplayName = providerName.replace(/-/g, ' ');
        return {
          providerName,
          providerDisplayName,
          installationName: '',
        };
      });
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
              'audience:server:client_id:dex-k8s-authenticator',
            ],
          }),
        ];
      },
    );

    return Object.fromEntries(entries);
  }

  getProviders() {
    // Installations explicitly marked as covered by the cluster token broker
    // (clusterTokenAudience set) get their tokens silently through the main
    // login, so their separate provider entries disappear from the settings
    // page. The main login itself always stays.
    const brokerConfigured = Boolean(
      this.configApi?.getOptionalString('gs.clusterTokenBroker.tokenUrl'),
    );
    const mainProviderName =
      this.configApi?.getOptionalString('gs.authProvider');

    const kubernetesAuthProviders = this.kubernetesAuthProviders.filter(
      ({ providerName, clusterTokenAudience }) => {
        if (!brokerConfigured || providerName === mainProviderName) {
          return true;
        }
        return !clusterTokenAudience;
      },
    );

    return [...kubernetesAuthProviders, ...this.mcpAuthProviders];
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

  getMCPAuthApis() {
    return this.mcpAuthApis;
  }
}
