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
import { SignInConnectorMemory } from './signInConnectorMemory';

export const gsAuthApiRef = createApiRef<AuthApi>({
  id: 'plugin.gs.auth',
});

/**
 * Second sign-in entry point of the main login provider, pinned to the Dex
 * connector `gs.signInFallbackProvider.connectorId`. Same backend provider
 * and session as {@link gsAuthApiRef}; only the login popup differs.
 */
export const gsFallbackSignInAuthApiRef = createApiRef<AuthApi>({
  id: 'plugin.gs.auth.fallback-sign-in',
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
  /**
   * The main login provider pinned to the fallback Dex connector
   * (`gs.signInFallbackProvider.connectorId`), for the login page's second
   * card. Throws when no fallback connector is configured.
   */
  getFallbackSignInAuthApi: () => AuthApi;
  getKubernetesAuthApis: () => { [providerName: string]: AuthApi };
  getMCPAuthApis: () => { [providerName: string]: AuthApi };
  /**
   * Backstage's standard GitHub auth API on the person's GitHub grant in
   * muster, when `gs.github` is configured; undefined otherwise (the app then
   * keeps the upstream GitHub auth provider).
   */
  getGithubAuthApi: () => AuthApi | undefined;
  /** Whether `gs.github` puts the GitHub auth API on muster. */
  hasGithubAuthApi: () => boolean;
  getProviders: () => AuthProvider[];
  /**
   * Ensures the lazily-loaded per-installation auth providers/APIs have been
   * built (they depend on the installations config fetched from the backend
   * after sign-in). Safe to call repeatedly.
   */
  ensureInitialized: () => Promise<void>;
  /**
   * Async lookup of a per-installation kubernetes (OIDC) auth API, awaiting
   * lazy initialization first. Returns `undefined` if not configured.
   */
  getKubernetesAuthApi: (providerName: string) => Promise<AuthApi | undefined>;
  /**
   * Names of installations whose cluster access is fully covered by the token
   * broker (broker configured, `clusterTokenAudience` set, not the main
   * provider). These can be connected to silently -- without a per-cluster
   * login popup -- so they are the set the global cluster-access connector
   * probes on startup.
   */
  getBrokerCoveredInstallations: () => string[];
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
  /**
   * Where this browser remembers the Dex connector of a sign-in through the
   * fallback card, so the main provider's silent re-logins reuse it. Defaults
   * to localStorage; tests pass their own.
   */
  signInConnectorMemory?: SignInConnectorMemory;
};
