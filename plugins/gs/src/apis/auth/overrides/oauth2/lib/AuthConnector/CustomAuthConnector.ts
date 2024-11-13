import {
  AuthProviderInfo,
  ConfigApi,
  DiscoveryApi,
  OAuthRequestApi,
  OAuthRequester,
} from '@backstage/core-plugin-api';
import { AuthConnector, PopupOptions } from './types';

import * as client from 'openid-client';
import { showLoginPopup } from '../loginPopup';

type Options<AuthSession> = {
  /**
   * DiscoveryApi instance used to locate the auth backend endpoint.
   */
  discoveryApi: DiscoveryApi;
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
  configApi?: ConfigApi;
  /**
   * Options used to configure auth popup
   */
  popupOptions?: PopupOptions;
};

function defaultJoinScopes(scopes: Set<string>) {
  return [...scopes].join(' ');
}
export class CustomAuthConnector<AuthSession>
  implements AuthConnector<AuthSession>
{
  private readonly discoveryApi: DiscoveryApi;
  private readonly environment: string;
  private readonly provider: AuthProviderInfo;
  private readonly joinScopesFunc: (scopes: Set<string>) => string;
  private readonly authRequester: OAuthRequester<AuthSession>;
  private readonly sessionTransform: (response: any) => Promise<AuthSession>;
  private readonly popupOptions: PopupOptions | undefined;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly metadataUrl: string;
  private readonly tokenEndpoint?: string;
  private readonly userinfoEndpoint?: string;
  private readonly refreshTokenLocalStorageKey: string;
  private readonly refreshTokenLockName: string;

  private initializePromise?: Promise<client.Configuration | null>;
  private config: client.Configuration | null = null;

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
    } = options;

    this.authRequester = oauthRequestApi.createAuthRequester({
      provider,
      onAuthRequest: async scopes => {
        return this.showPopup(scopes);
      },
    });

    this.discoveryApi = discoveryApi;
    this.environment = environment;
    this.provider = provider;
    this.joinScopesFunc = joinScopes;
    this.sessionTransform = sessionTransform;
    this.popupOptions = popupOptions;
    this.refreshTokenLocalStorageKey = `${provider.id}-refresh-token`;
    this.refreshTokenLockName = `${provider.id}-refresh-lock`;

    if (!configApi) {
      throw new Error('configApi is required');
    }

    const providerConfig = configApi.getOptionalConfig(
      `auth.providers.${this.provider.id}.${this.environment}`,
    );
    if (!providerConfig) {
      throw new Error(
        `No configuration found for provider ${this.provider.id} in environment ${this.environment}`,
      );
    }

    this.clientId = providerConfig.getString('dexClientId');
    this.clientSecret = providerConfig.getString('dexClientSecret');
    this.metadataUrl = providerConfig.getString('dexMetadataUrl');
    this.tokenEndpoint = providerConfig.getOptionalString('dexTokenEndpoint');
    this.userinfoEndpoint = providerConfig.getOptionalString(
      'dexUserinfoEndpoint',
    );

    this.initialize();
  }

  async initialize() {
    if (this.initializePromise) {
      return this.initializePromise;
    }

    try {
      this.initializePromise = client.discovery(
        new URL(this.metadataUrl),
        this.clientId,
        this.clientSecret,
      );
      this.config = await this.initializePromise;
    } catch (error) {
      this.config = null;
    } finally {
      delete this.initializePromise;
    }

    return this.config;
  }

  async createSession(options: { scopes: Set<string> }): Promise<AuthSession> {
    return this.authRequester(options.scopes);
  }

  async refreshSession(scopes?: Set<string>): Promise<any> {
    const authInfo = await window.navigator.locks.request(
      this.refreshTokenLockName,
      async () => this.refresh(scopes),
    );

    return await this.sessionTransform(authInfo);
  }

  async removeSession(): Promise<void> {
    return window.navigator.locks.request(this.refreshTokenLockName, async () =>
      this.remove(),
    );
  }

  private async showPopup(scopes: Set<string>): Promise<AuthSession> {
    const { redirectUrl, codeVerifier } = await this.start(scopes);

    const popupUrl = await this.buildUrl('/start', {
      redirectUrl: redirectUrl,
      origin: window.location.origin,
      flow: 'popup',
    });

    const width = this.popupOptions?.size?.fullscreen
      ? window.screen.width
      : this.popupOptions?.size?.width || 450;

    const height = this.popupOptions?.size?.fullscreen
      ? window.screen.height
      : this.popupOptions?.size?.height || 730;

    const response = await showLoginPopup({
      url: popupUrl,
      name: `${this.provider.title} Login`,
      origin: new URL(popupUrl).origin,
      width,
      height,
    });

    const authInfo = await this.authenticate(
      response.code,
      codeVerifier,
      scopes,
    );

    return await this.sessionTransform(authInfo);
  }

  private async buildUrl(
    path: string,
    query?: { [key: string]: string | boolean | undefined },
  ): Promise<string> {
    const baseUrl = await this.discoveryApi.getBaseUrl('auth');
    const queryString = this.buildQueryString({
      ...query,
      env: this.environment,
    });

    return `${baseUrl}/${this.provider.id}${path}${queryString}`;
  }

  private async buildRedirectUrl(): Promise<string> {
    const baseUrl = await this.discoveryApi.getBaseUrl('auth');

    return `${baseUrl}/${this.provider.id}/handler/frame`;
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

  private async start(
    scopes: Set<string>,
  ): Promise<{ redirectUrl: string; codeVerifier: string }> {
    const config = await this.getIssuerConfig();

    const redirect_uri = await this.buildRedirectUrl();

    const code_verifier: string = client.randomPKCECodeVerifier();
    const code_challenge: string =
      await client.calculatePKCECodeChallenge(code_verifier);

    const parameters: Record<string, string> = {
      redirect_uri,
      scope: this.joinScopesFunc(scopes),
      code_challenge,
      code_challenge_method: 'S256',
    };

    const redirectUrl: URL = client.buildAuthorizationUrl(config, parameters);

    return { redirectUrl: redirectUrl.toString(), codeVerifier: code_verifier };
  }

  private async authenticate(
    code: string,
    codeVerifier: string,
    scopes?: Set<string>,
  ) {
    const config = await this.getIssuerConfig();

    const redirectUrl = await this.buildRedirectUrl();

    const getCurrentUrl = () => {
      return new URL(`${redirectUrl}?code=${code}`);
    };

    const currentUrl = getCurrentUrl();

    const tokens = await client.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      idTokenExpected: true,
    });

    if (tokens.refresh_token) {
      this.saveRefreshToken(tokens.refresh_token);
    }

    return this.getAuthInfo(tokens, scopes);
  }

  private async refresh(scopes?: Set<string>) {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      throw new Error('Auth refresh request failed');
    }

    const config = await this.getIssuerConfig();
    const options = scopes ? { scope: this.joinScopesFunc(scopes) } : undefined;
    const tokens = await client.refreshTokenGrant(
      config,
      refreshToken,
      options,
    );

    if (tokens.refresh_token) {
      this.saveRefreshToken(tokens.refresh_token);
    }

    return this.getAuthInfo(tokens, scopes);
  }

  private async remove() {
    const refreshToken = this.getRefreshToken();
    const config = await this.getIssuerConfig();

    if (refreshToken && config.serverMetadata().revocation_endpoint) {
      await client.tokenRevocation(config, refreshToken);
    }

    this.removeRefreshToken();
  }

  private saveRefreshToken(refreshToken: string) {
    localStorage.setItem(this.refreshTokenLocalStorageKey, refreshToken);
  }

  private removeRefreshToken() {
    localStorage.removeItem(this.refreshTokenLocalStorageKey);
  }

  private getRefreshToken() {
    return localStorage.getItem(this.refreshTokenLocalStorageKey);
  }

  private async getIssuerConfig(): Promise<client.Configuration> {
    const config = this.config ?? (await this.initialize());

    if (!config) {
      throw new Error(
        'Auth provider is not available. Check if you connected to VPN.',
      );
    }

    const {
      issuer,
      authorization_endpoint,
      token_endpoint,
      jwks_uri,
      userinfo_endpoint,
      device_authorization_endpoint,
      grant_types_supported,
      response_types_supported,
      subject_types_supported,
      id_token_signing_alg_values_supported,
      code_challenge_methods_supported,
      scopes_supported,
      token_endpoint_auth_methods_supported,
      claims_supported,
    } = config.serverMetadata();

    return new client.Configuration(
      {
        issuer,
        authorization_endpoint,
        grant_types_supported,
        response_types_supported,
        subject_types_supported,
        id_token_signing_alg_values_supported,
        code_challenge_methods_supported,
        scopes_supported,
        token_endpoint_auth_methods_supported,
        claims_supported,
        jwks_uri: jwks_uri,
        device_authorization_endpoint,
        token_endpoint: this.tokenEndpoint ?? token_endpoint,
        userinfo_endpoint: this.userinfoEndpoint ?? userinfo_endpoint,
      },
      this.clientId,
      this.clientSecret,
    );
  }

  private getAuthInfo(
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    scopes?: Set<string>,
  ) {
    const claims = tokens.claims();

    return {
      profile: {
        email: claims?.email,
        displayName: claims?.name,
      },
      providerInfo: {
        accessToken: tokens.access_token,
        tokenType: tokens.token_type ?? 'bearer',
        scope: scopes ? this.joinScopesFunc(scopes) : undefined,
        expiresInSeconds: tokens.expires_in,
        idToken: tokens.id_token,
        refreshToken: tokens.refresh_token,
      },
    };
  }
}
