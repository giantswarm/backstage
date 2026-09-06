import {
  KubernetesApi,
  KubernetesAuthProvidersApi,
} from '@backstage/plugin-kubernetes-react';
import { getInstallationOidcToken } from './installationOidcToken';

describe('getInstallationOidcToken', () => {
  const getCluster = jest.fn();
  const getCredentials = jest.fn();

  const kubernetesApi = { getCluster } as unknown as KubernetesApi;
  const kubernetesAuthProvidersApi = {
    getCredentials,
  } as unknown as KubernetesAuthProvidersApi;

  beforeEach(() => {
    getCluster.mockReset();
    getCredentials.mockReset();
  });

  it('mints via the installation’s own oidc token provider', () => {
    // Each installation has its own Dex, so the provider is installation-scoped.
    getCluster.mockResolvedValue({
      authProvider: 'oidc',
      oidcTokenProvider: 'oidc-gazelle',
    });
    getCredentials.mockResolvedValue({ token: 'dex-token' });

    return getInstallationOidcToken(
      kubernetesApi,
      kubernetesAuthProvidersApi,
      'gazelle',
    ).then(token => {
      expect(token).toBe('dex-token');
      expect(getCredentials).toHaveBeenCalledWith('oidc.oidc-gazelle');
    });
  });

  it('passes a non-oidc auth provider through verbatim', async () => {
    getCluster.mockResolvedValue({ authProvider: 'serviceAccount' });
    getCredentials.mockResolvedValue({ token: 'sa-token' });

    await getInstallationOidcToken(
      kubernetesApi,
      kubernetesAuthProvidersApi,
      'gazelle',
    );

    expect(getCredentials).toHaveBeenCalledWith('serviceAccount');
  });

  it('throws for an installation the Kubernetes API does not know', async () => {
    getCluster.mockResolvedValue(undefined);

    await expect(
      getInstallationOidcToken(
        kubernetesApi,
        kubernetesAuthProvidersApi,
        'nope',
      ),
    ).rejects.toThrow(/not known to the Kubernetes API/);
    expect(getCredentials).not.toHaveBeenCalled();
  });

  it('throws a sign-in hint when no token comes back', async () => {
    // This is the per-installation degradation case: signed in to some
    // installations but not others.
    getCluster.mockResolvedValue({
      authProvider: 'oidc',
      oidcTokenProvider: 'oidc-golem',
    });
    getCredentials.mockResolvedValue({ token: undefined });

    await expect(
      getInstallationOidcToken(
        kubernetesApi,
        kubernetesAuthProvidersApi,
        'golem',
      ),
    ).rejects.toThrow(/log in to that installation first/);
  });
});
