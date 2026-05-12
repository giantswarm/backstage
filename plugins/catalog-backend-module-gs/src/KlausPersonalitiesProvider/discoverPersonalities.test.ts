import { mockServices } from '@backstage/backend-test-utils';
import type { GithubCredentialsProvider } from '@backstage/integration';
import { discoverPersonalities } from './discoverPersonalities';

const credentialsProvider: GithubCredentialsProvider = {
  getCredentials: jest.fn().mockResolvedValue({ token: 'fake-token' }),
} as unknown as GithubCredentialsProvider;

const source = {
  owner: 'giantswarm',
  repo: 'klaus-personalities',
  internal: false,
  ociRegistry: 'gsoci.azurecr.io',
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

function textResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
    ...init,
  });
}

describe('discoverPersonalities', () => {
  it('lists directories and parses personality.yaml for each', async () => {
    const fetchImpl = makeFetch(async (url: string) => {
      if (url.endsWith('/repos/giantswarm/klaus-personalities')) {
        return jsonResponse({ default_branch: 'main' });
      }
      if (url.endsWith('/contents/personalities')) {
        return jsonResponse([
          { name: 'sre', type: 'dir', path: 'personalities/sre' },
          { name: 'README.md', type: 'file', path: 'personalities/README.md' },
        ]);
      }
      if (url.endsWith('/contents/personalities/sre/personality.yaml')) {
        return textResponse(
          [
            'name: sre',
            'toolchain:',
            '  repository: gsoci.azurecr.io/giantswarm/klaus-toolchains/go',
            '  tag: 0.1.12',
            'plugins: []',
          ].join('\n'),
        );
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const result = await discoverPersonalities({
      source,
      credentialsProvider,
      logger: mockServices.logger.mock(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual([
      {
        name: 'sre',
        source,
        branch: 'main',
        toolchain: {
          repository: 'gsoci.azurecr.io/giantswarm/klaus-toolchains/go',
          tag: '0.1.12',
        },
        plugins: [],
      },
    ]);
  });

  it('returns plugins from personality.yaml', async () => {
    const fetchImpl = makeFetch(async (url: string) => {
      if (url.endsWith('/repos/giantswarm/klaus-personalities')) {
        return jsonResponse({ default_branch: 'main' });
      }
      if (url.endsWith('/contents/personalities')) {
        return jsonResponse([
          { name: 'sre', type: 'dir', path: 'personalities/sre' },
        ]);
      }
      return textResponse(
        [
          'toolchain:',
          '  repository: r',
          '  tag: t',
          'plugins:',
          '  - repository: gsociprivate.azurecr.io/giantswarm/klaus-plugins/gs-base',
          '    tag: v0.9.0',
        ].join('\n'),
      );
    });

    const result = await discoverPersonalities({
      source,
      credentialsProvider,
      logger: mockServices.logger.mock(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result[0].plugins).toEqual([
      {
        repository: 'gsociprivate.azurecr.io/giantswarm/klaus-plugins/gs-base',
        tag: 'v0.9.0',
      },
    ]);
  });

  it('falls back to "main" when default branch lookup fails', async () => {
    const fetchImpl = makeFetch(async (url: string) => {
      if (url.endsWith('/repos/giantswarm/klaus-personalities')) {
        return new Response('not found', { status: 404 });
      }
      if (url.endsWith('/contents/personalities')) {
        return jsonResponse([{ name: 'sre', type: 'dir', path: 'x' }]);
      }
      return textResponse('toolchain: { repository: r, tag: t }');
    });

    const result = await discoverPersonalities({
      source,
      credentialsProvider,
      logger: mockServices.logger.mock(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result[0].branch).toBe('main');
  });

  it('skips personalities whose YAML fetch fails but keeps the rest', async () => {
    const fetchImpl = makeFetch(async (url: string) => {
      if (url.endsWith('/repos/giantswarm/klaus-personalities')) {
        return jsonResponse({ default_branch: 'main' });
      }
      if (url.endsWith('/contents/personalities')) {
        return jsonResponse([
          { name: 'sre', type: 'dir', path: 'x' },
          { name: 'broken', type: 'dir', path: 'y' },
        ]);
      }
      if (url.endsWith('/contents/personalities/sre/personality.yaml')) {
        return textResponse('toolchain: { repository: r, tag: t }');
      }
      return new Response('not found', { status: 404 });
    });

    const result = await discoverPersonalities({
      source,
      credentialsProvider,
      logger: mockServices.logger.mock(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.map(r => r.name)).toEqual(['sre']);
  });

  it('throws if no GitHub token is available', async () => {
    const noTokenProvider: GithubCredentialsProvider = {
      getCredentials: jest.fn().mockResolvedValue({ token: undefined }),
    } as unknown as GithubCredentialsProvider;

    await expect(
      discoverPersonalities({
        source,
        credentialsProvider: noTokenProvider,
        logger: mockServices.logger.mock(),
        fetchImpl: jest.fn() as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/No GitHub credentials/);
  });
});
