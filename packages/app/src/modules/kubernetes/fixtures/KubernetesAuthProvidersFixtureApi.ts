import type { KubernetesAuthProvidersApi } from '@backstage/plugin-kubernetes-react';
import type {
  InstallationTokenOptions,
  KubernetesAuthProvidersWithOptionsApi,
} from '@giantswarm/backstage-plugin-kubernetes-react';

/** What the fixture installations' service account answers for a token. */
export const FIXTURE_INSTALLATION_TOKEN = 'fixture-installation-token';

/**
 * The Kubernetes auth providers in fixture mode (`gs.fixtures: true`): the
 * fixture installations use the `serviceAccount` provider, which has no token
 * in the browser, and the pages that send a token of their own (the Mimir
 * queries) refuse to ask without one. This answers a made-up one, which no
 * fixture API checks; every other provider is the portal's. Fixture mode
 * configures only the fixture installations, so no other one asks.
 */
export class KubernetesAuthProvidersFixtureApi
  implements KubernetesAuthProvidersApi, KubernetesAuthProvidersWithOptionsApi
{
  constructor(
    private readonly base: KubernetesAuthProvidersApi &
      KubernetesAuthProvidersWithOptionsApi,
  ) {}

  async getCredentials(
    authProvider: string,
    options?: InstallationTokenOptions,
  ): Promise<{ token?: string }> {
    if (authProvider === 'serviceAccount') {
      return { token: FIXTURE_INSTALLATION_TOKEN };
    }
    return this.base.getCredentials(authProvider, options);
  }

  async decorateRequestBodyForAuth(
    ...args: Parameters<
      KubernetesAuthProvidersApi['decorateRequestBodyForAuth']
    >
  ): ReturnType<KubernetesAuthProvidersApi['decorateRequestBodyForAuth']> {
    return this.base.decorateRequestBodyForAuth(...args);
  }
}
