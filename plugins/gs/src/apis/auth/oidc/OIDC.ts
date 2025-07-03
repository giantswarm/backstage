/*
 * Copyright 2024 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  AuthProviderInfo,
  AuthRequestOptions,
  BackstageIdentityApi,
  BackstageIdentityResponse,
  ConfigApi,
  DiscoveryApi,
  OAuthRequestApi,
  OpenIdConnectApi,
  ProfileInfo,
  ProfileInfoApi,
} from '@backstage/core-plugin-api';

import {
  OAuth2,
  OAuth2CreateOptions,
  OAuth2Session,
  PopupOptions,
} from '@backstage/core-app-api';
import { DefaultAuthConnector } from '../DefaultAuthConnector';

const PROVIDER_NAME = {
  id: 'oidc',
  title: 'OIDC',
  icon: () => null,
};

export default class OIDC
  implements OpenIdConnectApi, BackstageIdentityApi, ProfileInfoApi
{
  private authApi: OAuth2;
  private configApi: ConfigApi | undefined;
  private environment: string;
  private provider: AuthProviderInfo;
  private discoveryApi: DiscoveryApi;
  private oauthRequestApi: OAuthRequestApi;
  private popupOptions: PopupOptions | undefined;
  private defaultScopes: string[] | undefined;

  static create(options: OAuth2CreateOptions) {
    return new OIDC(options);
  }

  private constructor(options: OAuth2CreateOptions) {
    const {
      configApi,
      environment = 'development',
      provider = PROVIDER_NAME,
      discoveryApi,
      oauthRequestApi,
      popupOptions,
      defaultScopes = [
        'openid',
        'profile',
        'email',
        'groups',
        'offline_access',
        'federated:id',
        'audience:server:client_id:dex-k8s-authenticator',
      ],
    } = options;

    this.configApi = configApi;
    this.environment = environment;
    this.provider = provider;
    this.discoveryApi = discoveryApi;
    this.popupOptions = popupOptions;
    this.oauthRequestApi = oauthRequestApi;
    this.defaultScopes = defaultScopes;

    this.authApi = this.createAuthApi();
  }

  async getIdToken(options?: AuthRequestOptions | undefined): Promise<string> {
    return this.authApi.getIdToken(options);
  }

  getBackstageIdentity(
    options?: AuthRequestOptions,
  ): Promise<BackstageIdentityResponse | undefined> {
    return this.authApi.getBackstageIdentity(options);
  }

  getProfile(options?: AuthRequestOptions): Promise<ProfileInfo | undefined> {
    return this.authApi.getProfile(options);
  }

  private createAuthApi() {
    const authConnector = new DefaultAuthConnector({
      configApi: this.configApi,
      discoveryApi: this.discoveryApi,
      oauthRequestApi: this.oauthRequestApi,
      environment: this.environment,
      provider: this.provider,
      popupOptions: this.popupOptions,
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
