import { mockServices } from '@backstage/backend-test-utils';
import type { GithubCredentialsProvider } from '@backstage/integration';
import type { KlausSourceConfig } from './config';
import { discoverPlugins } from './discoverPlugins';

const credentialsProvider: GithubCredentialsProvider = {
  getCredentials: jest.fn().mockResolvedValue({ token: 'fake-token' }),
} as unknown as GithubCredentialsProvider;

const source: KlausSourceConfig = {
  kind: 'plugins',
  sourceRepository: 'https://github.com/giantswarm/klaus-plugins',
  owner: 'giantswarm',
  repo: 'klaus-plugins',
  ociRepository: 'gsoci.azurecr.io/giantswarm/klaus-plugins',
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

describe('discoverPlugins', () => {
  it('parses marketplace.json into one entry per plugin', async () => {
    const fetchImpl = makeFetch(async (url: string) => {
      if (url.endsWith('/repos/giantswarm/klaus-plugins')) {
        return jsonResponse({ default_branch: 'main' });
      }
      if (url.endsWith('/contents/.claude-plugin/marketplace.json')) {
        return textResponse(
          JSON.stringify({
            name: 'giantswarm',
            plugins: [
              {
                name: 'base',
                source: './plugins/base',
                description: 'Base plugin',
              },
              {
                name: 'gs-base',
                source: './plugins/gs-base',
              },
            ],
          }),
        );
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const result = await discoverPlugins({
      source,
      credentialsProvider,
      logger: mockServices.logger.mock(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual([
      {
        name: 'base',
        source,
        branch: 'main',
        description: 'Base plugin',
        pluginDir: 'plugins/base',
      },
      {
        name: 'gs-base',
        source,
        branch: 'main',
        description: undefined,
        pluginDir: 'plugins/gs-base',
      },
    ]);
  });

  it('skips malformed entries without name or source', async () => {
    const fetchImpl = makeFetch(async (url: string) => {
      if (url.endsWith('/repos/giantswarm/klaus-plugins')) {
        return jsonResponse({ default_branch: 'main' });
      }
      return textResponse(
        JSON.stringify({
          plugins: [
            { name: 'ok', source: './plugins/ok' },
            { name: 'no-source' },
            { source: './plugins/no-name' },
          ],
        }),
      );
    });

    const result = await discoverPlugins({
      source,
      credentialsProvider,
      logger: mockServices.logger.mock(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.map(r => r.name)).toEqual(['ok']);
  });

  it('throws on invalid JSON', async () => {
    const fetchImpl = makeFetch(async (url: string) => {
      if (url.endsWith('/repos/giantswarm/klaus-plugins')) {
        return jsonResponse({ default_branch: 'main' });
      }
      return textResponse('not json');
    });

    await expect(
      discoverPlugins({
        source,
        credentialsProvider,
        logger: mockServices.logger.mock(),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/Failed to parse marketplace.json/);
  });

  it('throws if no GitHub token is available', async () => {
    const noTokenProvider: GithubCredentialsProvider = {
      getCredentials: jest.fn().mockResolvedValue({ token: undefined }),
    } as unknown as GithubCredentialsProvider;

    await expect(
      discoverPlugins({
        source,
        credentialsProvider: noTokenProvider,
        logger: mockServices.logger.mock(),
        fetchImpl: jest.fn() as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/No GitHub credentials/);
  });
});
