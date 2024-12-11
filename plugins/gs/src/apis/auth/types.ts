import {
  BackstageIdentityApi,
  OAuthApi,
  OpenIdConnectApi,
  ProfileInfoApi,
  SessionApi,
  createApiRef,
} from '@backstage/core-plugin-api';

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
