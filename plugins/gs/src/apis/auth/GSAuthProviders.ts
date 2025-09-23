import {
  OAuth2CreateOptions,
  OAuthApiCreateOptions,
} from '@backstage/core-app-api';
import {
  ConfigApi,
  DiscoveryApi,
  OAuthRequestApi,
  OpenIdConnectApi,
} from '@backstage/core-plugin-api';
import {
  AuthApi,
  AuthProvider,
  GSAuthProvidersApi,
  gsAuthProvidersApiRef,
} from './types';
import { GiantSwarmIcon } from '../../assets/icons/CustomIcons';
import Pinniped from './pinniped/Pinniped';
import OIDC from './oidc/OIDC';
import { PinnipedSupervisorApi } from './pinniped/types';

const OIDC_PROVIDER_NAME_PREFIX = 'oidc-';
const PINNIPED_PROVIDER_NAME_PREFIX = 'pinniped-';

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
    const result = installationNames.map(installationName => {
      const installationConfig =
        installationsConfig.getConfig(installationName);
      const authProvider = installationConfig.getString('authProvider');
      if (!authProvider) {
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

      const namePrefix = oidcTokenProvider.startsWith(OIDC_PROVIDER_NAME_PREFIX)
        ? OIDC_PROVIDER_NAME_PREFIX
        : PINNIPED_PROVIDER_NAME_PREFIX;

      const providerDisplayName = oidcTokenProvider.split(namePrefix)[1];

      return {
        providerName: oidcTokenProvider,
        providerDisplayName,
        installationName,
      };
    });

    result.push({
      providerName: 'pinniped-golem',
      providerDisplayName: 'golem (pinniped)',
      installationName: 'golem',
    });

    return result;
  }

  private createAuthApis() {
    const entries = this.authProviders.map(authProvider => {
      const { providerName, providerDisplayName } = authProvider;

      const options: OAuth2CreateOptions = {
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
        popupOptions: {
          size: {
            width: 600,
            height: 600,
          },
        },
      };

      return [
        providerName,
        providerName.startsWith(OIDC_PROVIDER_NAME_PREFIX)
          ? OIDC.create(options)
          : Pinniped.create(options),
      ];
    });

    return Object.fromEntries(entries);
  }

  getProviders() {
    return this.authProviders;
  }

  getAuthProvider(authProviderName: string) {
    return this.authProviders.find(
      authProvider => authProvider.providerName === authProviderName,
    );
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

  getOIDCAuthApis() {
    const oidcAuthProviders = this.authProviders.filter(authProvider =>
      authProvider.providerName.startsWith(OIDC_PROVIDER_NAME_PREFIX),
    );

    return Object.fromEntries(
      oidcAuthProviders.map(authProvider => [
        authProvider.providerName,
        this.getAuthApi(authProvider.providerName) as OpenIdConnectApi,
      ]),
    );
  }

  getPinnipedAuthApis() {
    const pinnipedAuthProviders = this.authProviders.filter(authProvider =>
      authProvider.providerName.startsWith(PINNIPED_PROVIDER_NAME_PREFIX),
    );

    return Object.fromEntries(
      pinnipedAuthProviders.map(authProvider => [
        authProvider.providerName,
        this.getAuthApi(authProvider.providerName) as PinnipedSupervisorApi,
      ]),
    );
  }
}
