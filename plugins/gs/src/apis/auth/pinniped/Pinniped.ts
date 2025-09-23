import {
  AuthProviderInfo,
  AuthRequestOptions,
  ConfigApi,
  DiscoveryApi,
  OAuthRequestApi,
} from '@backstage/core-plugin-api';

import {
  OAuth2,
  OAuth2CreateOptions,
  OAuth2Session,
  PopupOptions,
} from '@backstage/core-app-api';
import { PinnipedSupervisorApi } from './types';
import { DefaultAuthConnector } from '../DefaultAuthConnector';

const PROVIDER_NAME = {
  id: 'pinniped',
  title: 'Pinniped',
  icon: () => null,
};

export default class Pinniped implements PinnipedSupervisorApi {
  private authApis: { [aud: string]: OAuth2 };
  private configApi: ConfigApi | undefined;
  private environment: string;
  private provider: AuthProviderInfo;
  private discoveryApi: DiscoveryApi;
  private oauthRequestApi: OAuthRequestApi;
  private popupOptions: PopupOptions | undefined;
  private defaultScopes: string[] | undefined;

  static create(options: OAuth2CreateOptions) {
    return new Pinniped(options);
  }

  private constructor(options: OAuth2CreateOptions) {
    const {
      configApi,
      environment = 'development',
      provider = PROVIDER_NAME,
      discoveryApi,
      oauthRequestApi,
      popupOptions,
      defaultScopes = ['openid', 'groups', 'offline_access'],
    } = options;

    this.configApi = configApi;
    this.environment = environment;
    this.provider = provider;
    this.discoveryApi = discoveryApi;
    this.popupOptions = popupOptions;
    this.oauthRequestApi = oauthRequestApi;
    this.defaultScopes = defaultScopes;

    this.authApis = {};
  }

  async getClusterScopedIdToken(
    audience: string,
    options?: AuthRequestOptions | undefined,
  ): Promise<string> {
    if (!(audience in this.authApis)) {
      this.authApis[audience] = this.createAuthApi(audience);
    }

    return await this.authApis[audience].getIdToken(options);
  }

  private createAuthApi(audience: string) {
    const authConnector = new DefaultAuthConnector({
      configApi: this.configApi,
      discoveryApi: this.discoveryApi,
      oauthRequestApi: this.oauthRequestApi,
      environment: this.environment,
      provider: this.provider,
      popupOptions: this.popupOptions,
      audience,
      sessionTransform({ backstageIdentity, ...res }): OAuth2Session {
        const session: OAuth2Session = {
          ...res,
          providerInfo: {
            idToken: res.providerInfo.idToken,
            accessToken: res.providerInfo.accessToken,
            scopes: OAuth2.normalizeScopes(res.providerInfo.scope),
            expiresAt: res.providerInfo.expiresInSeconds
              ? new Date(Date.now() + res.providerInfo.expiresInSeconds * 1000)
              : undefined,
          },
        };
        if (backstageIdentity) {
          session.backstageIdentity = {
            token: backstageIdentity.token,
            identity: backstageIdentity.identity,
            expiresAt: backstageIdentity.expiresInSeconds
              ? new Date(Date.now() + backstageIdentity.expiresInSeconds * 1000)
              : undefined,
          };
        }
        return session;
      },
    });

    return OAuth2.create({
      authConnector,
      defaultScopes: this.defaultScopes,
    });
  }
}
