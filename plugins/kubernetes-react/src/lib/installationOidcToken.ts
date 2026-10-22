import {
  KubernetesApi,
  KubernetesAuthProvidersApi,
} from '@backstage/plugin-kubernetes-react';

/**
 * What a token request may ask for beyond Backstage's
 * `getCredentials(authProvider)`.
 */
export type InstallationTokenOptions = {
  /**
   * The share of its lifetime (`exp` − `iat`, from 0 to 1) the token must
   * still have, for a receiver that keeps it for as long as the work it starts
   * runs. Without it, the session's cached token is good until its last 3
   * minutes.
   */
  minLifetimeLeft?: number;
};

/**
 * `KubernetesAuthProvidersApi.getCredentials` as the portal's implementation
 * takes it: with {@link InstallationTokenOptions} as a second argument, which
 * another implementation ignores.
 */
export type KubernetesAuthProvidersWithOptionsApi = {
  getCredentials(
    authProvider: string,
    options?: InstallationTokenOptions,
  ): Promise<{ token?: string }>;
};

/**
 * Mint the user's per-installation OIDC ID token:
 * `kubernetesApi.getCluster()` → `kubernetesAuthProvidersApi.getCredentials()`.
 *
 * Every installation has its own Dex and its own `oidcTokenProvider`, so there
 * is no fleet-wide token — callers fanning out across installations must mint
 * one per installation, and should treat a failure here as *that* installation
 * being unavailable rather than as a page-level error (the user may be signed
 * in to some installations and not others).
 *
 * Shared by the agent deploy flow (as the `USER_OIDC_TOKEN` scaffolder secret)
 * and the kagent API client (forwarded to the backend proxy, which promotes it
 * to `Authorization: Bearer` toward kagent), so both mint identically.
 *
 * `options` reach the auth providers only when set, so a plain mint is the
 * plain `getCredentials(authProvider)` call.
 */
export async function getInstallationOidcToken(
  kubernetesApi: KubernetesApi,
  kubernetesAuthProvidersApi: KubernetesAuthProvidersApi,
  installation: string,
  options: InstallationTokenOptions = {},
): Promise<string> {
  const cluster = await kubernetesApi.getCluster(installation);
  if (!cluster) {
    throw new Error(
      `Installation "${installation}" is not known to the Kubernetes API.`,
    );
  }

  const { authProvider, oidcTokenProvider } = cluster;
  const providerKey =
    authProvider === 'oidc'
      ? `${authProvider}.${oidcTokenProvider}`
      : authProvider;
  const { token } =
    options.minLifetimeLeft === undefined
      ? await kubernetesAuthProvidersApi.getCredentials(providerKey)
      : await (
          kubernetesAuthProvidersApi as KubernetesAuthProvidersWithOptionsApi
        ).getCredentials(providerKey, options);
  if (!token) {
    throw new Error(
      `Could not obtain an access token for "${installation}". You may need to log in to that installation first.`,
    );
  }

  return token;
}
