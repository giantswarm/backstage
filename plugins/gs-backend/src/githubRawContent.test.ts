import { GithubCredentialsProvider } from '@backstage/integration';

jest.mock('node-fetch', () => jest.fn());

import fetch from 'node-fetch';
import { fetchGitHubRawContent } from './githubRawContent';

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

  it('attaches the token the provider grants', async () => {
    const provider = makeCredentialsProvider('portal-token');

    await fetchGitHubRawContent(
      'https://raw.githubusercontent.com/giantswarm/some-repo/main/values.yaml',
      provider,
    );

    expect(provider.getCredentials).toHaveBeenCalledWith({
      url: 'https://github.com/giantswarm/some-repo',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/giantswarm/some-repo/main/values.yaml',
      { headers: { Authorization: 'Bearer portal-token' } },
    );
  });

  it('derives the owner from the normalized URL and fetches that same form', async () => {
    const provider = makeCredentialsProvider('portal-token');

    // Dot segments collapse before the owner is read, so the credentials
    // request names the owner the fetch actually hits, and the allowlist
    // wrapper judges the right one.
    for (const url of [
      'https://raw.githubusercontent.com/giantswarm/../other-org/private-repo/main/file',
      'https://raw.githubusercontent.com/giantswarm/%2e%2e/other-org/private-repo/main/file',
      'https://raw.githubusercontent.com/giantswarm/a\\..\\..\\other-org/private-repo/main/file',
    ]) {
      await fetchGitHubRawContent(url, provider);

      expect(provider.getCredentials).toHaveBeenLastCalledWith({
        url: 'https://github.com/other-org/private-repo',
      });
      expect(fetchMock).toHaveBeenLastCalledWith(
        'https://raw.githubusercontent.com/other-org/private-repo/main/file',
        expect.anything(),
      );
    }
  });

  it('never requests credentials for a non-raw.githubusercontent.com URL', async () => {
    const provider = makeCredentialsProvider('portal-token');

    await fetchGitHubRawContent(
      'https://example.com/giantswarm/repo/main/file',
      provider,
    );

    expect(provider.getCredentials).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/giantswarm/repo/main/file',
      { headers: {} },
    );
  });

  it('fetches without auth when no token is available', async () => {
    const provider = makeCredentialsProvider(undefined);

    await fetchGitHubRawContent(
      'https://raw.githubusercontent.com/giantswarm/public-repo/main/README.md',
      provider,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/giantswarm/public-repo/main/README.md',
      { headers: {} },
    );
  });

  it('fetches without auth when the provider refuses (owner not allowed) or throws', async () => {
    const provider = {
      getCredentials: jest.fn(async () => {
        throw new Error('not in gs.github.allowedOwners');
      }),
    } as unknown as GithubCredentialsProvider;

    await fetchGitHubRawContent(
      'https://raw.githubusercontent.com/some-other-org/repo/main/README.md',
      provider,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/some-other-org/repo/main/README.md',
      { headers: {} },
    );
  });
});
