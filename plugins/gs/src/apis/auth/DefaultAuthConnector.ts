/*
 * This is a copy of the https://github.com/backstage/backstage/blob/v1.40.1/packages/core-app-api/src/lib/AuthConnector/DefaultAuthConnector.ts
 * that uses a custom DiscoveryApiClient.
 */

/*
 * Copyright 2020 The Backstage Authors
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
  AuthConnector,
  AuthConnectorCreateSessionOptions,
  AuthConnectorRefreshSessionOptions,
  openLoginPopup,
  PopupOptions,
} from '@backstage/core-app-api';
import {
  AuthProviderInfo,
  ConfigApi,
  OAuthRequestApi,
  OAuthRequester,
} from '@backstage/core-plugin-api';
import { DiscoveryApiClient } from '../discovery/DiscoveryApiClient';

let warned = false;

/**
 * Short-lived cluster token minted by the cluster token broker.
 */
export type ClusterToken = {
  token: string;
  expiresInSeconds?: number;
};

/**
 * Coarse, UI-facing reason why a broker-backed cluster token could not be
 * obtained. `session-expired` means the main Dex session is gone (and the
 * single SSO re-login was declined or failed); the others mirror the backend
 * cluster-token router's failure modes.
 */
export type ClusterTokenErrorReason =
  | 'session-expired'
  | 'broker_unreachable'
  | 'exchange_failed'
  | 'subject_invalid'
  | 'unknown';

/**
 * Typed error thrown by a broker-backed `clusterTokenProvider`/refresh. Carries
 * the affected installation and a coarse reason so the cluster-access status
 * UI can show what went wrong without per-cluster login popups.
 */
export class ClusterTokenError extends Error {
  readonly installation: string;
  readonly reason: ClusterTokenErrorReason;

  constructor(
    installation: string,
    reason: ClusterTokenErrorReason,
    message?: string,
  ) {
    super(
      message ??
        `Cluster token request for installation "${installation}" failed: ${reason}`,
    );
    this.name = 'ClusterTokenError';
    this.installation = installation;
    this.reason = reason;
  }
}

type Options<AuthSession> = {
  /**
   * DiscoveryApi instance used to locate the auth backend endpoint.
   */
  discoveryApi: DiscoveryApiClient;
  /**
   * Environment hint passed on to auth backend, for example 'production' or 'development'
   */
  environment: string;
  /**
   * Information about the auth provider to be shown to the user.
   * The ID Must match the backend auth plugin configuration, for example 'google'.
   */
  provider: AuthProviderInfo;
  /**
   * API used to instantiate an auth requester.
   */
  oauthRequestApi: OAuthRequestApi;
  /**
   * Function used to join together a set of scopes, defaults to joining with a space character.
   */
  joinScopes?: (scopes: Set<string>) => string;
  /**
   * Function used to transform an auth response into the session type.
   */
  sessionTransform?(response: any): AuthSession | Promise<AuthSession>;
  /**
   * ConfigApi instance used to configure authentication flow of pop-up or redirect.
   */
  configApi?: ConfigApi;
  /**
   * Options used to configure auth popup
   */
  popupOptions?: PopupOptions;
  /**
   * Optional function used to silently mint a cluster token through the
   * token broker. When provided, refreshSession tries it before the
   * cookie-based refresh, so broker-covered clusters never trigger a login
   * popup. Returning undefined or throwing falls back to the legacy flow.
   */
  clusterTokenProvider?: () => Promise<ClusterToken | undefined>;
};

function defaultJoinScopes(scopes: Set<string>) {
  return [...scopes].join(' ');
}

/**
 * DefaultAuthConnector is the default auth connector in Backstage. It talks to the
 * backend auth plugin through the standardized API, and requests user permission
 * via the OAuthRequestApi.
 */
export class DefaultAuthConnector<
  AuthSession,
> implements AuthConnector<AuthSession> {
  private readonly discoveryApi: DiscoveryApiClient;
  private readonly environment: string;
  private readonly provider: AuthProviderInfo;
  private readonly joinScopesFunc: (scopes: Set<string>) => string;
  private readonly authRequester: OAuthRequester<AuthSession>;
  private readonly sessionTransform: (response: any) => Promise<AuthSession>;
  private readonly enableExperimentalRedirectFlow: boolean;
  private readonly popupOptions: PopupOptions | undefined;
  private readonly clusterTokenProvider?: () => Promise<
    ClusterToken | undefined
  >;
  constructor(options: Options<AuthSession>) {
    const {
      configApi,
      discoveryApi,
      environment,
      provider,
      joinScopes = defaultJoinScopes,
      oauthRequestApi,
      sessionTransform = id => id,
      popupOptions,
      clusterTokenProvider,
    } = options;

    if (!warned && !configApi) {
      // eslint-disable-next-line no-console
      console.warn(
        'DEPRECATION WARNING: Authentication providers require a configApi instance to configure the authentication flow. Please provide one to the authentication provider constructor.',
      );
      warned = true;
    }

    this.enableExperimentalRedirectFlow = configApi
      ? (configApi.getOptionalBoolean('enableExperimentalRedirectFlow') ??
        false)
      : false;

    this.authRequester = oauthRequestApi.createAuthRequester({
      provider,
      onAuthRequest: async scopes => {
        if (!this.enableExperimentalRedirectFlow) {
          return this.showPopup(scopes);
        }
        return this.executeRedirect(scopes);
      },
    });

    this.discoveryApi = discoveryApi;
    this.environment = environment;
    this.provider = provider;
    this.joinScopesFunc = joinScopes;
    this.sessionTransform = sessionTransform;
    this.popupOptions = popupOptions;
    this.clusterTokenProvider = clusterTokenProvider;
  }

  async createSession(
    options: AuthConnectorCreateSessionOptions,
  ): Promise<AuthSession> {
    // Broker-backed clusters never open a per-cluster login popup. A new
    // session is minted exactly like a refresh -- through the broker, which
    // itself triggers the single main Dex login when the main session is gone.
    if (this.clusterTokenProvider) {
      return this.mintBrokerSession(options.scopes);
    }
    if (options.instantPopup) {
      if (this.enableExperimentalRedirectFlow) {
        return this.executeRedirect(options.scopes);
      }
      return this.showPopup(options.scopes);
    }
    return this.authRequester(options.scopes);
  }

  async refreshSession(
    options?: AuthConnectorRefreshSessionOptions,
  ): Promise<any> {
    // Broker-backed clusters are broker-only: no cookie `/refresh`, no popup.
    // A failure surfaces as a typed ClusterTokenError instead of silently
    // falling back to a legacy flow that 404s for private clusters.
    if (this.clusterTokenProvider) {
      return this.mintBrokerSession(options?.scopes);
    }

    const res = await fetch(
      await this.buildUrl('/refresh', {
        optional: true,
        ...(options && { scope: this.joinScopesFunc(options.scopes) }),
      }),
      {
        headers: {
          'x-requested-with': 'XMLHttpRequest',
        },
        credentials: 'include',
      },
    ).catch(error => {
      throw new Error(`Auth refresh request failed, ${error}`);
    });

    if (!res.ok) {
      const error: any = new Error(
        `Auth refresh request failed, ${res.statusText}`,
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
    return await this.sessionTransform(authInfo);
  }

  /**
   * Mints a session for a broker-backed cluster through the injected
   * `clusterTokenProvider`. The provider triggers the single main Dex login
   * when the main session is missing and throws a typed {@link ClusterTokenError}
   * on a real broker failure -- both propagate to the caller unchanged so the
   * cluster-access status UI can react. No cookie refresh, no per-cluster popup.
   */
  private async mintBrokerSession(scopes?: Set<string>): Promise<AuthSession> {
    const clusterToken = await this.clusterTokenProvider!();
    if (!clusterToken) {
      throw new ClusterTokenError(
        this.installationId() ?? this.provider.id,
        'unknown',
      );
    }
    return await this.sessionTransform({
      providerInfo: {
        idToken: clusterToken.token,
        accessToken: clusterToken.token,
        scope: scopes ? this.joinScopesFunc(scopes) : '',
        expiresInSeconds: clusterToken.expiresInSeconds,
      },
    });
  }

  async removeSession(): Promise<void> {
    const res = await fetch(await this.buildUrl('/logout'), {
      method: 'POST',
      headers: {
        'x-requested-with': 'XMLHttpRequest',
      },
      credentials: 'include',
    }).catch(error => {
      throw new Error(`Logout request failed, ${error}`);
    });

    if (!res.ok) {
      const error: any = new Error(`Logout request failed, ${res.statusText}`);
      error.status = res.status;
      throw error;
    }
  }

  private async showPopup(scopes: Set<string>): Promise<AuthSession> {
    const scope = this.joinScopesFunc(scopes);
    const popupUrl = await this.buildUrl('/start', {
      scope,
      origin: window.location.origin,
      flow: 'popup',
    });

    const width = this.popupOptions?.size?.fullscreen
      ? window.screen.width
      : this.popupOptions?.size?.width || 450;

    const height = this.popupOptions?.size?.fullscreen
      ? window.screen.height
      : this.popupOptions?.size?.height || 730;

    const payload = await openLoginPopup({
      url: popupUrl,
      name: `${this.provider.title} Login`,
      width,
      height,
    });

    return await this.sessionTransform(payload);
  }

  private async executeRedirect(scopes: Set<string>): Promise<AuthSession> {
    const scope = this.joinScopesFunc(scopes);
    // redirect to auth api
    window.location.href = await this.buildUrl('/start', {
      scope,
      origin: window.location.origin,
      redirectUrl: window.location.href,
      flow: 'redirect',
    });
    // return a promise that never resolves
    return new Promise(() => {});
  }

  /**
   * Installation name encoded in the provider id (e.g. `oidc-golem` -> `golem`).
   * Returns undefined when the id does not follow the `oidc-` convention.
   */
  private installationId(): string | undefined {
    return this.provider.id.split('oidc-')[1];
  }

  private async buildUrl(
    path: string,
    query?: { [key: string]: string | boolean | undefined },
  ): Promise<string> {
    const installation = this.installationId();
    const baseUrl = await this.discoveryApi.getBaseUrl('auth', installation);

    const queryString = this.buildQueryString({
      ...query,
      env: this.environment,
    });

    return `${baseUrl}/${this.provider.id}${path}${queryString}`;
  }

  private buildQueryString(query?: {
    [key: string]: string | boolean | undefined;
  }): string {
    if (!query) {
      return '';
    }

    const queryString = Object.entries<string | boolean | undefined>(query)
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

    if (!queryString) {
      return '';
    }
    return `?${queryString}`;
  }
}
