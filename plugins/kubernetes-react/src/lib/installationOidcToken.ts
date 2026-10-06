import {
  KubernetesApi,
  KubernetesAuthProvidersApi,
} from '@backstage/plugin-kubernetes-react';

/**
 * No token can be minted for the installation without asking the person: the
 * Kubernetes API does not know it, or its auth provider returned no token. A
 * declined or failed sign-in is not this error; it surfaces as the auth
 * provider's own.
 */
export class InstallationTokenUnavailableError extends Error {
  readonly name = 'InstallationTokenUnavailableError';

  constructor(
    message: string,
    readonly reason: 'unknown-installation' | 'no-token',
  ) {
    super(message);
  }
}

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
 */
export async function getInstallationOidcToken(
  kubernetesApi: KubernetesApi,
  kubernetesAuthProvidersApi: KubernetesAuthProvidersApi,
  installation: string,
): Promise<string> {
  const cluster = await kubernetesApi.getCluster(installation);
  if (!cluster) {
    throw new InstallationTokenUnavailableError(
      `Installation "${installation}" is not known to the Kubernetes API.`,
      'unknown-installation',
    );
  }

  const { authProvider, oidcTokenProvider } = cluster;
  const { token } = await kubernetesAuthProvidersApi.getCredentials(
    authProvider === 'oidc'
      ? `${authProvider}.${oidcTokenProvider}`
      : authProvider,
  );
  if (!token) {
    throw new InstallationTokenUnavailableError(
      `Could not obtain an access token for "${installation}". You may need to log in to that installation first.`,
      'no-token',
    );
  }

  return token;
}
