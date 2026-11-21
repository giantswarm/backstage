import type { KubernetesAuthProvidersApi } from '@backstage/plugin-kubernetes-react';

/**
 * The group of the guest's installation token in fixture mode, which
 * `gs.adminGroups` in `app-config.fixtures.yaml` lists: the guest is Giant
 * Swarm staff, so the pages show what only staff see.
 */
export const FIXTURE_STAFF_GROUP = 'fixture-giantswarm-staff';

function base64Url(value: object): string {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * The guest's installation token: an unsigned JWT with the guest's groups.
 * Only the portal reads it; the fixture APIs take any token.
 */
export const FIXTURE_INSTALLATION_TOKEN = [
  base64Url({ alg: 'none', typ: 'JWT' }),
  base64Url({ sub: 'guest', groups: [FIXTURE_STAFF_GROUP] }),
  '',
].join('.');

/**
 * The fixture installations' cluster access: every installation answers the
 * guest's token, and requests go out as they are.
 */
export class KubernetesAuthProvidersFixtureApi implements KubernetesAuthProvidersApi {
  async getCredentials(_authProvider: string): Promise<{ token?: string }> {
    return { token: FIXTURE_INSTALLATION_TOKEN };
  }

  async decorateRequestBodyForAuth(
    _authProvider: string,
    requestBody: Parameters<
      KubernetesAuthProvidersApi['decorateRequestBodyForAuth']
    >[1],
  ) {
    return requestBody;
  }
}

export function kubernetesAuthProvidersFixtureApi(): KubernetesAuthProvidersApi {
  return new KubernetesAuthProvidersFixtureApi();
}
