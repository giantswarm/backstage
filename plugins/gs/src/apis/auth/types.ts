import {
  AuthProviderInfo,
  BackstageIdentityApi,
  ConfigApi,
  OAuthApi,
  OAuthRequestApi,
  OpenIdConnectApi,
  ProfileInfoApi,
  SessionApi,
  createApiRef,
} from '@backstage/core-plugin-api';
import { DiscoveryApiClient } from '../discovery/DiscoveryApiClient';

export const gsAuthApiRef = createApiRef<AuthApi>({
  id: 'plugin.gs.auth',
});

export const gsAuthProvidersApiRef = createApiRef<GSAuthProvidersApi>({
  id: 'plugin.gs.auth-providers',
});

export type AuthApi = OAuthApi &
  OpenIdConnectApi &
  ProfileInfoApi &
  BackstageIdentityApi &
  SessionApi;

export type AuthProvider = {
  providerName: string;
  providerDisplayName: string;
  installationName: string;
};

export type GSAuthProvidersApi = {
  getAuthApi: (providerName: string) => AuthApi | undefined;
  getMainAuthApi: () => AuthApi;
  getAuthApis: () => { [providerName: string]: AuthApi };
  getProviders: () => AuthProvider[];
};

export type GSAuthProvidersApiCreateOptions = {
  discoveryApi: DiscoveryApiClient;
  environment?: string;
  provider?: AuthProviderInfo;
  configApi?: ConfigApi;
  oauthRequestApi: OAuthRequestApi;
  defaultScopes?: string[];
};
