import { mockServices } from '@backstage/backend-test-utils';
import type { GithubCredentialsProvider } from '@backstage/integration';
import type {
  EntityProviderConnection,
  EntityProviderMutation,
} from '@backstage/plugin-catalog-node';
import { KlausPersonalitiesProvider } from './KlausPersonalitiesProvider';
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
    if (url.endsWith(`/repos/giantswarm/${repo}/contents/personalities`)) {
      return new Response(
        JSON.stringify([{ name: 'sre', type: 'dir', path: 'x' }]),
        { status: 200 },
      );
    }
    return new Response('toolchain: { repository: r, tag: t }', {
      status: 200,
    });
  };
}

describe('KlausPersonalitiesProvider', () => {
  it('exposes a stable provider name', () => {
    const provider = new KlausPersonalitiesProvider({
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

  it('applies a full mutation with one entity per discovered personality', async () => {
    const fetchByRepo: Record<string, ReturnType<typeof makeFetchForRepo>> = {
      'klaus-personalities': makeFetchForRepo('klaus-personalities'),
      'klaus-personalities-internal': makeFetchForRepo(
        'klaus-personalities-internal',
      ),
    };
    const fetchImpl = jest.fn(async (url: string) => {
      const match = url.match(/\/repos\/giantswarm\/([^/]+)/);
      if (!match) throw new Error(`unexpected url: ${url}`);
      return fetchByRepo[match[1]](url);
    });

    const provider = new KlausPersonalitiesProvider({
      sources: [
        {
          owner: 'giantswarm',
          repo: 'klaus-personalities',
          internal: false,
          ociRegistry: 'gsoci.azurecr.io',
        },
        {
          owner: 'giantswarm',
          repo: 'klaus-personalities-internal',
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

    // Inject our fetch into discoverPersonalities by patching globalThis.fetch.
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
      'klaus-personality-sre',
      'klaus-personality-sre-internal',
    ]);
  });

  it('throws when refresh runs before connect', async () => {
    const provider = new KlausPersonalitiesProvider({
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
