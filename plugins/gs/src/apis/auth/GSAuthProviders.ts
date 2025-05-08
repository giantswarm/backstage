import { OAuth2, OAuthApiCreateOptions } from '@backstage/core-app-api';
import { default as CustomOAuth2 } from './overrides/oauth2/OAuth2';
import {
  ConfigApi,
  DiscoveryApi,
  OAuthRequestApi,
} from '@backstage/core-plugin-api';
import {
  AuthApi,
  AuthProvider,
  GSAuthProvidersApi,
  gsAuthProvidersApiRef,
} from './types';
import { GiantSwarmIcon } from '../../assets/icons/CustomIcons';

const OIDC_PROVIDER_NAME_PREFIX = 'oidc-';
const CUSTOM_OIDC_PROVIDER_NAME_PREFIX = 'gs-';

/**
 * A client for authenticating towards Giant Swarm Management APIs.
 *
 * @public
 */
export class GSAuthProviders implements GSAuthProvidersApi {
  private readonly configApi?: ConfigApi;
  private readonly discoveryApi: DiscoveryApi;
  private readonly oauthRequestApi: OAuthRequestApi;
  private readonly authProviders: AuthProvider[];
  private readonly authApis: { [providerName: string]: AuthApi };

  constructor(options: OAuthApiCreateOptions) {
    this.configApi = options.configApi;
    this.discoveryApi = options.discoveryApi;
    this.oauthRequestApi = options.oauthRequestApi;

    this.authProviders = this.getAuthProvidersFromConfig();
    this.authApis = this.createAuthApis();
  }

  static create(
    options: OAuthApiCreateOptions,
  ): typeof gsAuthProvidersApiRef.T {
    return new GSAuthProviders(options);
  }

  private getAuthProvidersFromConfig(): AuthProvider[] {
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

      if (!oidcTokenProvider) {
        throw new Error(
          `OIDC token provider is not configured for installation "${installationName}".`,
        );
      }

      let providerDisplayName = oidcTokenProvider;
      if (oidcTokenProvider.startsWith(OIDC_PROVIDER_NAME_PREFIX)) {
        providerDisplayName = oidcTokenProvider.split(
          OIDC_PROVIDER_NAME_PREFIX,
        )[1];
      } else if (
        oidcTokenProvider.startsWith(CUSTOM_OIDC_PROVIDER_NAME_PREFIX)
      ) {
        providerDisplayName = oidcTokenProvider.split(
          CUSTOM_OIDC_PROVIDER_NAME_PREFIX,
        )[1];
      }

      return {
        providerName: oidcTokenProvider,
        providerDisplayName,
        installationName,
      };
    });
  }

  private createAuthApis() {
    const entries = this.authProviders.map(
      ({ providerName, providerDisplayName }) => {
        const OAuth2Impl = providerName.startsWith(
          CUSTOM_OIDC_PROVIDER_NAME_PREFIX,
        )
          ? CustomOAuth2
          : OAuth2;

        return [
          providerName,
          OAuth2Impl.create({
            configApi: this.configApi,
            discoveryApi: this.discoveryApi,
            oauthRequestApi: this.oauthRequestApi,
            provider: {
              id: providerName,
              title: providerDisplayName,
              icon: GiantSwarmIcon,
            },
            environment: this.configApi?.getOptionalString('auth.environment'),
            defaultScopes: [
              'openid',
              'profile',
              'email',
              'groups',
              'offline_access',
              'federated:id',
              'audience:server:client_id:dex-k8s-authenticator',
            ],
            popupOptions: {
              size: {
                width: 600,
                height: 600,
              },
            },
          }),
        ];
      },
    );

    return Object.fromEntries(entries);
  }

  getProviders() {
    return this.authProviders;
  }

  getAuthApi(providerName: string) {
    return this.authApis[providerName];
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

  getAuthApis() {
    return this.authApis;
  }
}
