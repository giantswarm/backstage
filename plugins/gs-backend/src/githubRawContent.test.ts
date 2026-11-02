import { GithubCredentialsProvider } from '@backstage/integration';

jest.mock('node-fetch', () => jest.fn());

import fetch from 'node-fetch';
import {
  DEFAULT_ALLOWED_OWNERS,
  fetchGitHubRawContent,
} from './githubRawContent';

const fetchMock = fetch as unknown as jest.Mock;

function makeCredentialsProvider(token?: string) {
  return {
    getCredentials: jest.fn(async () => ({ token })),
  } as unknown as GithubCredentialsProvider & {
    getCredentials: jest.Mock;
  };
}

describe('fetchGitHubRawContent', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true });
  });

  it('attaches the portal token for an allowed owner', async () => {
    const provider = makeCredentialsProvider('portal-token');

    await fetchGitHubRawContent(
      'https://raw.githubusercontent.com/giantswarm/some-repo/main/values.yaml',
      provider,
      ['giantswarm'],
    );

    expect(provider.getCredentials).toHaveBeenCalledWith({
      url: 'https://github.com/giantswarm/some-repo',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/giantswarm/some-repo/main/values.yaml',
      { headers: { Authorization: 'Bearer portal-token' } },
    );
  });

  it('never requests credentials for an owner outside the allowlist', async () => {
    const provider = makeCredentialsProvider('portal-token');

    await fetchGitHubRawContent(
      'https://raw.githubusercontent.com/some-other-org/private-repo/main/secrets.md',
      provider,
      ['giantswarm'],
    );

    expect(provider.getCredentials).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/some-other-org/private-repo/main/secrets.md',
      { headers: {} },
    );
  });

  it('matches owners case-insensitively', async () => {
    const provider = makeCredentialsProvider('portal-token');

    await fetchGitHubRawContent(
      'https://raw.githubusercontent.com/GiantSwarm/some-repo/main/README.md',
      provider,
      ['giantswarm'],
    );

    expect(provider.getCredentials).toHaveBeenCalled();
  });

  it('defaults the allowlist to giantswarm', async () => {
    const provider = makeCredentialsProvider('portal-token');

    await fetchGitHubRawContent(
      'https://raw.githubusercontent.com/not-giantswarm/repo/main/file',
      provider,
    );

    expect(DEFAULT_ALLOWED_OWNERS).toEqual(['giantswarm']);
    expect(provider.getCredentials).not.toHaveBeenCalled();
  });

  it('fetches without auth when no token is available', async () => {
    const provider = makeCredentialsProvider(undefined);

    await fetchGitHubRawContent(
      'https://raw.githubusercontent.com/giantswarm/public-repo/main/README.md',
      provider,
      ['giantswarm'],
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/giantswarm/public-repo/main/README.md',
      { headers: {} },
    );
  });

  it('fetches without auth when the credentials provider throws', async () => {
    const provider = {
      getCredentials: jest.fn(async () => {
        throw new Error('no integration configured');
      }),
    } as unknown as GithubCredentialsProvider;

    await fetchGitHubRawContent(
      'https://raw.githubusercontent.com/giantswarm/public-repo/main/README.md',
      provider,
      ['giantswarm'],
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/giantswarm/public-repo/main/README.md',
      { headers: {} },
    );
  });
});
