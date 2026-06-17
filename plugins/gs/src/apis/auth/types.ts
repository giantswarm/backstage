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
import { ClusterAccessStatusApi } from '../clusterAccessStatus';

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
  /**
   * Audience requested from the cluster token broker for this installation.
   * When set, the installation is considered fully covered by the broker.
   */
  clusterTokenAudience?: string;
};

export type GSAuthProvidersApi = {
  getAuthApi: (providerName: string) => AuthApi | undefined;
  getMainAuthApi: () => AuthApi;
  getKubernetesAuthApis: () => { [providerName: string]: AuthApi };
  getMCPAuthApis: () => { [providerName: string]: AuthApi };
  getProviders: () => AuthProvider[];
};

export type GSAuthProvidersApiCreateOptions = {
  discoveryApi: DiscoveryApiClient;
  environment?: string;
  provider?: AuthProviderInfo;
  configApi?: ConfigApi;
  oauthRequestApi: OAuthRequestApi;
  defaultScopes?: string[];
  /**
   * Store that records per-cluster access outcomes (success / degraded /
   * session-expired) for the sidebar status element. Optional so tests and
   * non-broker setups can omit it.
   */
  clusterAccessStatusApi?: ClusterAccessStatusApi;
};
