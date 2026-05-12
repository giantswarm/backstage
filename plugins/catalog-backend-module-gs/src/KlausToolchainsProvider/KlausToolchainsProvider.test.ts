import { mockServices } from '@backstage/backend-test-utils';
import type { GithubCredentialsProvider } from '@backstage/integration';
import type {
  EntityProviderConnection,
  EntityProviderMutation,
} from '@backstage/plugin-catalog-node';
import { KlausToolchainsProvider } from './KlausToolchainsProvider';
import { PROVIDER_NAME } from './buildEntity';

const credentialsProvider: GithubCredentialsProvider = {
  getCredentials: jest.fn().mockResolvedValue({ token: 'fake-token' }),
} as unknown as GithubCredentialsProvider;

function makeFetchForRepo(repo: string) {
  return async (url: string): Promise<Response> => {
    if (url.endsWith(`/repos/giantswarm/${repo}`)) {
      return new Response(JSON.stringify({ default_branch: 'main' }), {
        status: 200,
      });
    }
    if (url.endsWith(`/repos/giantswarm/${repo}/contents`)) {
      return new Response(
        JSON.stringify([{ name: 'klaus-go', type: 'dir', path: 'klaus-go' }]),
        { status: 200 },
      );
    }
    if (url.endsWith('/contents/klaus-go/Dockerfile')) {
      return new Response(
        JSON.stringify({ type: 'file', name: 'Dockerfile' }),
        { status: 200 },
      );
    }
    return new Response('not found', { status: 404 });
  };
}

describe('KlausToolchainsProvider', () => {
  it('exposes a stable provider name', () => {
    const provider = new KlausToolchainsProvider({
      sources: [],
      credentialsProvider,
      logger: mockServices.logger.mock(),
      scheduler: mockServices.scheduler.mock(),
      schedule: {
        frequency: { hours: 6 },
        timeout: { minutes: 5 },
      },
    });
    expect(provider.getProviderName()).toBe(PROVIDER_NAME);
  });

  it('applies a full mutation with one entity per discovered toolchain', async () => {
    const fetchByRepo: Record<string, ReturnType<typeof makeFetchForRepo>> = {
      'klaus-toolchains': makeFetchForRepo('klaus-toolchains'),
      'klaus-toolchains-internal': makeFetchForRepo(
        'klaus-toolchains-internal',
      ),
    };
    const fetchImpl = jest.fn(async (url: string) => {
      const match = url.match(/\/repos\/giantswarm\/([^/]+)/);
      if (!match) throw new Error(`unexpected url: ${url}`);
      return fetchByRepo[match[1]](url);
    });

    const provider = new KlausToolchainsProvider({
      sources: [
        {
          owner: 'giantswarm',
          repo: 'klaus-toolchains',
          internal: false,
          ociRegistry: 'gsoci.azurecr.io',
        },
        {
          owner: 'giantswarm',
          repo: 'klaus-toolchains-internal',
          internal: true,
          ociRegistry: 'gsociprivate.azurecr.io',
        },
      ],
      credentialsProvider,
      logger: mockServices.logger.mock(),
      scheduler: mockServices.scheduler.mock(),
      schedule: {
        frequency: { hours: 6 },
        timeout: { minutes: 5 },
      },
    });

    const originalFetch = global.fetch;
    global.fetch = fetchImpl as unknown as typeof fetch;

    const applied: EntityProviderMutation[] = [];
    const connection: EntityProviderConnection = {
      applyMutation: async m => {
        applied.push(m);
      },
      refresh: async () => {},
    };

    try {
      await provider.connect(connection);
      await provider.refresh();
    } finally {
      global.fetch = originalFetch;
    }

    expect(applied).toHaveLength(1);
    const mutation = applied[0];
    expect(mutation.type).toBe('full');
    if (mutation.type !== 'full') throw new Error('expected full');
    expect(mutation.entities.map(e => e.entity.metadata.name).sort()).toEqual([
      'klaus-toolchain-go',
      'klaus-toolchain-go-internal',
    ]);
  });

  it('throws when refresh runs before connect', async () => {
    const provider = new KlausToolchainsProvider({
      sources: [],
      credentialsProvider,
      logger: mockServices.logger.mock(),
      scheduler: mockServices.scheduler.mock(),
      schedule: {
        frequency: { hours: 6 },
        timeout: { minutes: 5 },
      },
    });
    await expect(provider.refresh()).rejects.toThrow(/not connected/);
  });
});
