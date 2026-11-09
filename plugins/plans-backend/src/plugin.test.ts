import {
  mockCredentials,
  mockServices,
  startTestBackend,
  TestBackend,
  TestDatabases,
} from '@backstage/backend-test-utils';
import {
  McpContentItem,
  MusterServerClient,
  MusterServerGateway,
} from '@giantswarm/backstage-plugin-gs-node';
import { Knex } from 'knex';
import request from 'supertest';
import { plansPlugin } from './plugin';

jest.setTimeout(60_000);

const REPO = 'giantswarm/meadow-plans';

/**
 * The plugin as the backend runs it, on a database every instance shares:
 * the store's migrations and its wiring into the router. GitHub stands in
 * for muster, answering each person by the token they forwarded.
 */
describe('plansPlugin', () => {
  const databases = TestDatabases.create({
    ids: ['POSTGRES_18', 'SQLITE_3'],
  });
  const reads: string[] = [];
  const backends: TestBackend[] = [];

  beforeEach(() => {
    reads.length = 0;
    const github = {
      server: 'github',
      callContent: async (
        tool: string,
        args: Record<string, unknown>,
        token: string,
      ): Promise<McpContentItem[]> => {
        if (tool !== 'get_file_contents') {
          throw new Error(`unexpected ${tool}`);
        }
        reads.push(token);
        return [
          {
            type: 'resource',
            resource: {
              uri: 'repo://x',
              mimeType: 'text/plain',
              text: `${args.path} for ${token}`,
            },
          },
        ];
      },
      login: async () => ({ status: 'connected', message: 'Connected' }),
    } as unknown as MusterServerGateway;
    jest
      .spyOn(MusterServerClient, 'fromConfig')
      .mockReturnValue(github as MusterServerClient);
  });

  afterEach(async () => {
    await Promise.all(backends.splice(0).map(backend => backend.stop()));
    jest.restoreAllMocks();
  });

  const startInstance = async (knex: Knex) => {
    const backend = await startTestBackend({
      features: [
        plansPlugin,
        mockServices.database.factory({ knex }),
        mockServices.rootConfig.factory({
          data: {
            plans: {
              repositories: [REPO],
              muster: { installation: 'test', server: 'github' },
            },
          },
        }),
      ],
    });
    backends.push(backend);
    return backend;
  };

  const readPlan = (backend: TestBackend, user: string) =>
    request(backend.server)
      .get('/api/plans/content')
      .query({ path: 'plan-a/PRD.md', ref: 'main' })
      .set('Authorization', mockCredentials.user.header(user))
      .set('backstage-muster-authorization', `token-of-${user}`);

  it.each(databases.eachSupportedId())(
    'serves a stored read on every instance, never across persons, %p',
    async databaseId => {
      const knex = await databases.init(databaseId);
      const alice = 'user:default/alice';
      const bob = 'user:default/bob';

      const first = await startInstance(knex);
      const second = await startInstance(knex);

      const read = await readPlan(first, alice);
      expect(read.status).toBe(200);
      expect(read.body.content).toBe(`plan-a/PRD.md for token-of-${alice}`);

      // The other instance answers warm, from the stored read.
      const shared = await readPlan(second, alice);
      expect(shared.body).toEqual(read.body);
      expect(reads).toEqual([`token-of-${alice}`]);

      // Another person gets their own read, made with their own grant.
      const other = await readPlan(second, bob);
      expect(other.body.content).toBe(`plan-a/PRD.md for token-of-${bob}`);
      expect(reads).toEqual([`token-of-${alice}`, `token-of-${bob}`]);
    },
  );
});
