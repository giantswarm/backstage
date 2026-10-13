import { mockServices } from '@backstage/backend-test-utils';
import { GithubCredentialsProvider } from '@backstage/integration';
import {
  AllowedOwnersGithubCredentialsProvider,
  DEFAULT_ALLOWED_OWNERS,
  readAllowedOwners,
} from './githubCredentials';

function makeDelegate(token?: string) {
  return {
    getCredentials: jest.fn(async () => ({ token, type: 'app' as const })),
  } as unknown as GithubCredentialsProvider & { getCredentials: jest.Mock };
}

describe('readAllowedOwners', () => {
  it('returns the configured list', () => {
    const config = mockServices.rootConfig({
      data: { gs: { github: { allowedOwners: ['giantswarm', 'acme-corp'] } } },
    });

    expect(readAllowedOwners(config)).toEqual(['giantswarm', 'acme-corp']);
  });

  it('defaults to giantswarm when nothing is configured', () => {
    const config = mockServices.rootConfig({ data: {} });

    expect(readAllowedOwners(config)).toEqual(['giantswarm']);
    expect(readAllowedOwners(config)).toEqual(DEFAULT_ALLOWED_OWNERS);
  });
});

describe('AllowedOwnersGithubCredentialsProvider', () => {
  it('delegates for an allowed owner, with a canonical URL', async () => {
    const delegate = makeDelegate('portal-token');
    const provider = new AllowedOwnersGithubCredentialsProvider(delegate, [
      'giantswarm',
    ]);

    const credentials = await provider.getCredentials({
      url: 'https://github.com/giantswarm/some-repo',
    });

    expect(credentials.token).toBe('portal-token');
    expect(delegate.getCredentials).toHaveBeenCalledWith({
      url: 'https://github.com/giantswarm/some-repo',
    });
  });

  it('refuses an owner outside the allowlist without consulting the delegate', async () => {
    const delegate = makeDelegate('portal-token');
    const provider = new AllowedOwnersGithubCredentialsProvider(delegate, [
      'giantswarm',
    ]);

    await expect(
      provider.getCredentials({
        url: 'https://github.com/some-other-org/private-repo',
      }),
    ).rejects.toThrow(/not in gs\.github\.allowedOwners/);
    expect(delegate.getCredentials).not.toHaveBeenCalled();
  });

  it('matches owners case-insensitively', async () => {
    const delegate = makeDelegate('portal-token');
    const provider = new AllowedOwnersGithubCredentialsProvider(delegate, [
      'giantswarm',
    ]);

    await provider.getCredentials({
      url: 'https://github.com/GiantSwarm/some-repo',
    });

    expect(delegate.getCredentials).toHaveBeenCalled();
  });

  it('derives the owner from the normalized URL, so dot segments cannot smuggle one past', async () => {
    const delegate = makeDelegate('portal-token');
    const provider = new AllowedOwnersGithubCredentialsProvider(delegate, [
      'giantswarm',
    ]);

    // All normalize to an other-org path, which is what would be fetched.
    for (const url of [
      'https://github.com/giantswarm/../other-org/private-repo',
      'https://github.com/giantswarm/%2e%2e/other-org/private-repo',
      'https://github.com/giantswarm/a\\..\\..\\other-org/private-repo',
    ]) {
      await expect(provider.getCredentials({ url })).rejects.toThrow(
        /not in gs\.github\.allowedOwners/,
      );
    }
    expect(delegate.getCredentials).not.toHaveBeenCalled();
  });

  it('allows a URL that normalizes INTO an allowed owner, and canonicalizes it for the delegate', async () => {
    const delegate = makeDelegate('portal-token');
    const provider = new AllowedOwnersGithubCredentialsProvider(delegate, [
      'giantswarm',
    ]);

    // Normalizes to /giantswarm/repo — the form any fetch would hit.
    await provider.getCredentials({
      url: 'https://github.com/other-org/../giantswarm/repo',
    });

    expect(delegate.getCredentials).toHaveBeenCalledWith({
      url: 'https://github.com/giantswarm/repo',
    });
  });

  it('refuses a URL without both owner and repo', async () => {
    const delegate = makeDelegate('portal-token');
    const provider = new AllowedOwnersGithubCredentialsProvider(delegate, [
      'giantswarm',
    ]);

    await expect(
      provider.getCredentials({ url: 'https://github.com/giantswarm' }),
    ).rejects.toThrow();
    await expect(
      // Normalizes to the bare origin.
      provider.getCredentials({ url: 'https://github.com/../giantswarm' }),
    ).rejects.toThrow();
    expect(delegate.getCredentials).not.toHaveBeenCalled();
  });

  it('propagates delegate failures (no integration configured)', async () => {
    const delegate = {
      getCredentials: jest.fn(async () => {
        throw new Error('no integration configured');
      }),
    } as unknown as GithubCredentialsProvider;
    const provider = new AllowedOwnersGithubCredentialsProvider(delegate, [
      'giantswarm',
    ]);

    await expect(
      provider.getCredentials({ url: 'https://github.com/giantswarm/repo' }),
    ).rejects.toThrow('no integration configured');
  });
});
