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
    const providersConfig = this.configApi?.getOptionalConfig('auth.providers');
    const configuredProviders = providersConfig?.keys() || [];
    return configuredProviders
      .filter(
        providerName =>
          providerName.startsWith(OIDC_PROVIDER_NAME_PREFIX) ||
          providerName.startsWith(CUSTOM_OIDC_PROVIDER_NAME_PREFIX),
      )
      .map(providerName => {
        let providerDisplayName = providerName;
        if (providerName.startsWith(OIDC_PROVIDER_NAME_PREFIX)) {
          providerDisplayName = providerName.split(
            OIDC_PROVIDER_NAME_PREFIX,
          )[1];
        } else if (providerName.startsWith(CUSTOM_OIDC_PROVIDER_NAME_PREFIX)) {
          providerDisplayName = providerName.split(
            CUSTOM_OIDC_PROVIDER_NAME_PREFIX,
          )[1];
        }

        return {
          providerName,
          providerDisplayName,
          installationName: providerDisplayName,
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

        const title = providerName.startsWith(CUSTOM_OIDC_PROVIDER_NAME_PREFIX)
          ? `${providerDisplayName} (VPN required)`
          : providerDisplayName;

        return [
          providerName,
          OAuth2Impl.create({
            configApi: this.configApi,
            discoveryApi: this.discoveryApi,
            oauthRequestApi: this.oauthRequestApi,
            provider: {
              id: providerName,
              title,
              icon: GiantSwarmIcon,
            },
            environment: this.configApi?.getOptionalString('auth.environment'),
            defaultScopes: [
              'openid',
              'profile',
              'email',
              'groups',
              'offline_access',
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

  getAuthApis() {
    return this.authApis;
  }
}
