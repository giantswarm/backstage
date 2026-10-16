import type { KubernetesAuthProvidersApi } from '@backstage/plugin-kubernetes-react';
import type { GSAuthProvidersApi } from '@giantswarm/backstage-plugin-gs';
import { isSessionExpiredError } from '@giantswarm/backstage-plugin-kubernetes-react';
import { GSKubernetesAuthProviders } from './KubernetesApiOverrides';

function setup(options: { session: boolean; gesture: boolean }) {
  // The provider's id token: the live session's when there is one; without
  // one the interactive path opens the sign-in, the optional one answers none.
  const getIdToken = jest.fn(async (request?: { optional?: boolean }) => {
    if (options.session) {
      return 'session-id-token';
    }
    return request?.optional ? '' : 'token-after-sign-in';
  });
  const gsAuthProvidersApi = {
    getKubernetesAuthApi: jest.fn(async (name: string) =>
      name === 'oidc-agent-platform' ? { getIdToken } : undefined,
    ),
  } as unknown as GSAuthProvidersApi;
  const base = {
    getCredentials: jest.fn(async () => ({ token: 'base-token' })),
    decorateRequestBodyForAuth: jest.fn(async (_, body) => body),
  } as unknown as KubernetesAuthProvidersApi;
  const providers = new GSKubernetesAuthProviders(
    base,
    gsAuthProvidersApi,
    () => options.gesture,
  );
  return { providers, getIdToken, base };
}

describe('GSKubernetesAuthProviders', () => {
  it("answers a background read with the live session's token, without prompting", async () => {
    const { providers, getIdToken } = setup({ session: true, gesture: false });
    await expect(
      providers.getCredentials('oidc.oidc-agent-platform'),
    ).resolves.toEqual({ token: 'session-id-token' });
    expect(getIdToken).toHaveBeenCalledWith({ optional: true });
  });

  it('fails a background read as session-expired once the session is gone, never opening the sign-in', async () => {
    const { providers, getIdToken } = setup({ session: false, gesture: false });
    const error = await providers
      .getCredentials('oidc.oidc-agent-platform')
      .catch(e => e);
    expect(isSessionExpiredError(error)).toBe(true);
    expect(getIdToken).toHaveBeenCalledTimes(1);
    expect(getIdToken).toHaveBeenCalledWith({ optional: true });
  });

  it('fails the request body decoration the same way', async () => {
    const { providers } = setup({ session: false, gesture: false });
    const error = await providers
      .decorateRequestBodyForAuth('oidc.oidc-agent-platform', {
        entity: {} as never,
      })
      .catch(e => e);
    expect(isSessionExpiredError(error)).toBe(true);
  });

  it("takes the interactive path for a person's action, which may ask for the sign-in", async () => {
    const { providers, getIdToken } = setup({ session: false, gesture: true });
    await expect(
      providers.getCredentials('oidc.oidc-agent-platform'),
    ).resolves.toEqual({ token: 'token-after-sign-in' });
    expect(getIdToken).toHaveBeenCalledWith();
  });

  it('leaves non-OIDC providers to the upstream implementation', async () => {
    const { providers, base } = setup({ session: false, gesture: false });
    await expect(providers.getCredentials('google')).resolves.toEqual({
      token: 'base-token',
    });
    expect(base.getCredentials).toHaveBeenCalledWith('google');
  });
});
