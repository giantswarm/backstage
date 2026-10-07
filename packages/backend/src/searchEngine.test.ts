import {
  mockServices,
  startTestBackend,
  TestDatabases,
} from '@backstage/backend-test-utils';
import { createBackendModule } from '@backstage/backend-plugin-api';
import searchPlugin from '@backstage/plugin-search-backend';
import pgSearchEngineModule from '@backstage/plugin-search-backend-module-pg';
import { searchIndexRegistryExtensionPoint } from '@backstage/plugin-search-backend-node/alpha';
import { Readable } from 'stream';
import request from 'supertest';

jest.setTimeout(60_000);

// The search plugin with the engine module the backend wires, on the databases
// the backend runs on: sqlite always; Postgres where
// BACKSTAGE_TEST_DATABASE_POSTGRES18_CONNECTION_STRING names one (no container
// is started, the CI job has no Docker).
const databases = TestDatabases.create({
  ids: ['SQLITE_3', 'POSTGRES_18'],
  disableDocker: true,
});

type Knex = Awaited<ReturnType<TestDatabases['init']>>;

const document = {
  title: 'kept-component',
  text: 'A component whose index outlives the backend.',
  location: '/catalog/default/component/kept-component',
};

type Replica = 'indexes at start' | 'has not indexed yet';

// A collator run once right at start, or never, like a replica whose
// scheduled run has not come yet. `indexed` resolves once the index is built.
function testCollator(replica: Replica) {
  let resolve: () => void = () => {};
  const indexed = new Promise<void>(r => {
    resolve = r;
  });
  const module = createBackendModule({
    pluginId: 'search',
    moduleId: 'test-collator',
    register(env) {
      env.registerInit({
        deps: { registry: searchIndexRegistryExtensionPoint },
        async init({ registry }) {
          registry.addCollator({
            schedule: {
              async run(task) {
                if (replica === 'has not indexed yet') {
                  return;
                }
                await task.fn(new AbortController().signal);
                resolve();
              },
            },
            factory: {
              type: 'software-catalog',
              async getCollator() {
                return Readable.from([document]);
              },
            },
          });
        },
      });
    },
  });
  return { module, indexed };
}

async function startSearchBackend(knex: Knex, replica: Replica) {
  const collator = testCollator(replica);
  const backend = await startTestBackend({
    features: [
      searchPlugin,
      pgSearchEngineModule,
      mockServices.database.factory({ knex }),
      collator.module,
    ],
  });
  return { backend, indexed: collator.indexed };
}

// The portal's search page asks for its document types by name; the in-memory
// engine answers MissingIndexError for a type it has no index of.
function query(backend: { server: Parameters<typeof request>[0] }) {
  return request(backend.server).get(
    '/api/search/query?term=kept&types[]=software-catalog',
  );
}

describe('the search engine', () => {
  it.each(databases.eachSupportedId())(
    'answers with the documents a collator indexed, %p',
    async databaseId => {
      const knex = await databases.init(databaseId);
      const { backend, indexed } = await startSearchBackend(
        knex,
        'indexes at start',
      );
      await indexed;

      const response = await query(backend);

      expect(response.status).toBe(200);
      expect(response.body.results.map((r: any) => r.document.title)).toEqual([
        'kept-component',
      ]);
      await backend.stop();
    },
  );

  it('is the in-memory engine on sqlite, so a replica answers only once it indexed', async () => {
    const knex = await databases.init('SQLITE_3');
    const { backend } = await startSearchBackend(knex, 'has not indexed yet');

    const response = await query(backend);

    expect(response.status).toBe(500);
    expect(response.body.error.name).toBe('MissingIndexError');
    expect(await knex.schema.hasTable('documents')).toBe(false);
    await backend.stop();
  });

  // Skipped, not passed, where no Postgres is configured.
  (databases.supports('POSTGRES_18') ? describe : describe.skip)(
    'on Postgres',
    () => {
      it('answers an empty set, not an error, before any index', async () => {
        const knex = await databases.init('POSTGRES_18');
        const { backend } = await startSearchBackend(
          knex,
          'has not indexed yet',
        );

        const response = await query(backend);

        expect(response.status).toBe(200);
        expect(response.body.results).toEqual([]);
        await backend.stop();
      });

      it('keeps the index in the database, so a restarted backend answers at once', async () => {
        const knex = await databases.init('POSTGRES_18');
        const first = await startSearchBackend(knex, 'indexes at start');
        await first.indexed;
        await first.backend.stop();
        expect(await knex.schema.hasTable('documents')).toBe(true);

        const second = await startSearchBackend(knex, 'has not indexed yet');
        const response = await query(second.backend);

        expect(response.status).toBe(200);
        expect(response.body.results.map((r: any) => r.document.title)).toEqual(
          ['kept-component'],
        );
        await second.backend.stop();
      });
    },
  );
});
