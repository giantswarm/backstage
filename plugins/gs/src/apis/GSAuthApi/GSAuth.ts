import { OAuth2, OAuthApiCreateOptions } from '@backstage/core-app-api';
import {
  ConfigApi,
  DiscoveryApi,
  OAuthRequestApi,
} from '@backstage/core-plugin-api';
import { AuthApi, AuthProvider, GSAuthApi, gsAuthApiRef } from './GSAuthApi';
import { GiantSwarmIcon } from '../../assets/icons/CustomIcons';

const PROVIDER_NAME_PREFIX = 'gs-';

/**
 * A client for authenticating towards Giant Swarm Management APIs.
 *
 * @public
 */
export class GSAuth implements GSAuthApi {
  private readonly configApi?: ConfigApi;
  private readonly discoveryApi: DiscoveryApi;
  private readonly oauthRequestApi: OAuthRequestApi;
  private readonly authProviders: AuthProvider[];
  private readonly authApis: {[providerName: string]: AuthApi};

  constructor(options: OAuthApiCreateOptions) {
    this.configApi = options.configApi;
    this.discoveryApi = options.discoveryApi;
    this.oauthRequestApi = options.oauthRequestApi;
    
    this.authProviders = this.getAuthProvidersFromConfig();
    this.authApis = this.createAuthApis();
  }

  static create(options: OAuthApiCreateOptions): typeof gsAuthApiRef.T {
    return new GSAuth(options);
  }

  private getAuthProvidersFromConfig() {
    const providersConfig = this.configApi?.getOptionalConfig('auth.providers');
    const configuredProviders = providersConfig?.keys() || [];
    return configuredProviders
      .filter((providerName) => providerName.startsWith(PROVIDER_NAME_PREFIX))
      .map((providerName) => {
        const providerDisplayName = providerName.split(PROVIDER_NAME_PREFIX)[1];
        const installationName = providerName.split(PROVIDER_NAME_PREFIX)[1];
        const installationConfig = this.configApi?.getOptionalConfig(`gs.installations.${installationName}`);
        const apiEndpoint = installationConfig?.getString('apiEndpoint') || '';

        return {
          providerName,
          providerDisplayName,
          installationName,
          apiEndpoint,
        };
      });
  }

  private createAuthApis() {
    const entries = this.authProviders.map(({ providerName, providerDisplayName }) => {
      return [
        providerName,
        OAuth2.create({
          configApi: this.configApi,
          discoveryApi: this.discoveryApi,
          oauthRequestApi: this.oauthRequestApi,
          provider: {
            id: providerName,
            title: providerDisplayName,
            icon: GiantSwarmIcon,
          },
          environment: this.configApi?.getOptionalString('auth.environment'),
          defaultScopes: ['openid', 'profile', 'email', 'groups', 'offline_access', 'audience:server:client_id:dex-k8s-authenticator'],
          popupOptions: {
            size: {
              width: 600,
              height: 600,
            },
          },
        }),
      ]
    });

    return Object.fromEntries(entries);
  }

  getProviders() {
    return this.authProviders;
  }

  getAuthApi(providerName: string) {
    return this.authApis[providerName];
  }
}
