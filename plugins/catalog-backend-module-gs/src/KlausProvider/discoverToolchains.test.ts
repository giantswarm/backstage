import { mockServices } from '@backstage/backend-test-utils';
import type { GithubCredentialsProvider } from '@backstage/integration';
import type { KlausSourceConfig } from './config';
import { discoverToolchains } from './discoverToolchains';

const credentialsProvider: GithubCredentialsProvider = {
  getCredentials: jest.fn().mockResolvedValue({ token: 'fake-token' }),
} as unknown as GithubCredentialsProvider;

const source: KlausSourceConfig = {
  kind: 'toolchains',
  sourceRepository: 'https://github.com/giantswarm/klaus-toolchains',
  owner: 'giantswarm',
  repo: 'klaus-toolchains',
  ociRepository: 'gsoci.azurecr.io/giantswarm/klaus-toolchains',
};

function makeFetch(handler: (url: string) => Response | Promise<Response>) {
  return jest.fn(async (url: string) => handler(url));
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('discoverToolchains', () => {
  it('lists only klaus- dirs with a Dockerfile, excluding others', async () => {
    const fetchImpl = makeFetch(async (url: string) => {
      if (url.endsWith('/repos/giantswarm/klaus-toolchains')) {
        return jsonResponse({ default_branch: 'main' });
      }
      if (url.endsWith('/repos/giantswarm/klaus-toolchains/contents')) {
        return jsonResponse([
          { name: 'klaus-go', type: 'dir', path: 'klaus-go' },
          { name: 'klaus-python', type: 'dir', path: 'klaus-python' },
          { name: 'docs', type: 'dir', path: 'docs' },
          { name: 'README.md', type: 'file', path: 'README.md' },
        ]);
      }
      if (url.endsWith('/contents/klaus-go/Dockerfile')) {
        return jsonResponse({ type: 'file', name: 'Dockerfile' });
      }
      if (url.endsWith('/contents/klaus-python/Dockerfile')) {
        return jsonResponse({ type: 'file', name: 'Dockerfile' });
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const result = await discoverToolchains({
      source,
      credentialsProvider,
      logger: mockServices.logger.mock(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual([
      { name: 'go', dirName: 'klaus-go', source, branch: 'main' },
      { name: 'python', dirName: 'klaus-python', source, branch: 'main' },
    ]);
  });

  it('skips klaus- dirs that do not contain a Dockerfile', async () => {
    const fetchImpl = makeFetch(async (url: string) => {
      if (url.endsWith('/repos/giantswarm/klaus-toolchains')) {
        return jsonResponse({ default_branch: 'main' });
      }
      if (url.endsWith('/repos/giantswarm/klaus-toolchains/contents')) {
        return jsonResponse([
          { name: 'klaus-go', type: 'dir', path: 'klaus-go' },
          { name: 'klaus-empty', type: 'dir', path: 'klaus-empty' },
        ]);
      }
      if (url.endsWith('/contents/klaus-go/Dockerfile')) {
        return jsonResponse({ type: 'file', name: 'Dockerfile' });
      }
      if (url.endsWith('/contents/klaus-empty/Dockerfile')) {
        return new Response('not found', { status: 404 });
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const result = await discoverToolchains({
      source,
      credentialsProvider,
      logger: mockServices.logger.mock(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.map(r => r.name)).toEqual(['go']);
  });

  it('throws if no GitHub token is available', async () => {
    const noTokenProvider: GithubCredentialsProvider = {
      getCredentials: jest.fn().mockResolvedValue({ token: undefined }),
    } as unknown as GithubCredentialsProvider;

    await expect(
      discoverToolchains({
        source,
        credentialsProvider: noTokenProvider,
        logger: mockServices.logger.mock(),
        fetchImpl: jest.fn() as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/No GitHub credentials/);
  });
});
