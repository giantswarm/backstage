import {
  BackstageIdentityApi,
  OAuthApi,
  OpenIdConnectApi,
  ProfileInfoApi,
  SessionApi,
  createApiRef,
} from '@backstage/core-plugin-api';

export const gsAuthApiRef = createApiRef<GSAuthApi>({
  id: 'plugin.gs.auth',
});

export type AuthApi = OAuthApi & OpenIdConnectApi & ProfileInfoApi & BackstageIdentityApi & SessionApi;

export type AuthProvider = {
  providerName: string;
  providerDisplayName: string;
  installationName: string;
}

export type GSAuthApi = {
  getAuthApi: (providerName: string) => AuthApi;
  getAuthApis: () => {[providerName: string]: AuthApi};
  getProviders: () => AuthProvider[];
}
