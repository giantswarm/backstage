import {
  mockCredentials,
  mockServices,
  startTestBackend,
  TestBackend,
  TestDatabases,
} from '@backstage/backend-test-utils';
import {
  MusterServerClient,
  MusterServerGateway,
} from '@giantswarm/backstage-plugin-gs-node';
import { Knex } from 'knex';
import request from 'supertest';
import { roadmapPlugin } from './plugin';

jest.setTimeout(60_000);

const ITEM = {
  id: 'PVTI_1',
  title: 'Agent workspaces',
  repo: 'giantswarm/giantswarm',
  fields: { Status: 'Done ✅', Team: 'Bumblebee🐝' },
};

/**
 * The plugin as the backend runs it, on a database every instance shares:
 * the store's migrations, its wiring into the router and the prune task. pro
 * stands in for muster, answering each person by the token they forwarded.
 */
describe('roadmapPlugin', () => {
  const databases = TestDatabases.create({
    ids: ['POSTGRES_18', 'SQLITE_3'],
  });
  const reads: string[] = [];
  const backends: TestBackend[] = [];

  beforeEach(() => {
    reads.length = 0;
    const pro = {
      server: 'mcp-pro',
      call: async (tool: string, _args: unknown, token: string) => {
        if (tool !== 'list_issues') {
          throw new Error(`unexpected ${tool}`);
        }
        reads.push(token);
        return { issues: [{ ...ITEM, title: `${ITEM.title} for ${token}` }] };
      },
      login: async () => ({ status: 'connected', message: 'Connected' }),
    } as unknown as MusterServerGateway;
    jest
      .spyOn(MusterServerClient, 'fromConfig')
      .mockReturnValue(pro as MusterServerClient);
  });

  afterEach(async () => {
    await Promise.all(backends.splice(0).map(backend => backend.stop()));
    jest.restoreAllMocks();
  });

  const startInstance = async (knex: Knex) => {
    const backend = await startTestBackend({
      features: [
        roadmapPlugin,
        mockServices.database.factory({ knex }),
        mockServices.rootConfig.factory({
          data: {
            roadmap: {
              board: 'roadmap',
              muster: { installation: 'test', server: 'mcp-pro' },
            },
          },
        }),
      ],
    });
    backends.push(backend);
    return backend;
  };

  const readDone = (backend: TestBackend, user: string) =>
    request(backend.server)
      .get('/api/roadmap/items')
      .query({ status: 'Done ✅' })
      .set('Authorization', mockCredentials.user.header(user))
      .set('backstage-muster-authorization', `token-of-${user}`);

  it.each(databases.eachSupportedId())(
    'serves a stored read across instances and restarts, never across persons, %p',
    async databaseId => {
      const knex = await databases.init(databaseId);
      const alice = 'user:default/alice';
      const bob = 'user:default/bob';

      const first = await startInstance(knex);
      const second = await startInstance(knex);

      const read = await readDone(first, alice);
      expect(read.status).toBe(200);
      expect(read.body.items[0].title).toBe(
        `${ITEM.title} for token-of-${alice}`,
      );

      // The other instance answers from the stored read.
      const shared = await readDone(second, alice);
      expect(shared.body).toEqual(read.body);
      expect(reads).toEqual([`token-of-${alice}`]);

      // Both instances restart: the read survives.
      await Promise.all(backends.splice(0).map(backend => backend.stop()));
      const restarted = await startInstance(knex);
      const afterRestart = await readDone(restarted, alice);
      expect(afterRestart.body).toEqual(read.body);
      expect(reads).toEqual([`token-of-${alice}`]);

      // Another person gets their own read, made with their own grant.
      const other = await readDone(restarted, bob);
      expect(other.body.items[0].title).toBe(
        `${ITEM.title} for token-of-${bob}`,
      );
      expect(reads).toEqual([`token-of-${alice}`, `token-of-${bob}`]);
    },
  );
});
