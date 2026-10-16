import type { LoggerService } from '@backstage/backend-plugin-api';
import { TestDatabases } from '@backstage/backend-test-utils';
import knexFactory, { Knex } from 'knex';
import { serializeMigrations } from './database';

jest.setTimeout(60_000);

// Postgres where BACKSTAGE_TEST_DATABASE_POSTGRES18_CONNECTION_STRING names
// one (no container is started; CI runs a Postgres service beside the job).
const databases = TestDatabases.create({
  ids: ['POSTGRES_18'],
  disableDocker: true,
});

if (process.env.CI && !databases.supports('POSTGRES_18')) {
  throw new Error(
    'CI runs the Postgres cases: set BACKSTAGE_TEST_DATABASE_POSTGRES18_CONNECTION_STRING',
  );
}

function mockLogger() {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger;
}

// One slow migration, so two backends that start it at once overlap.
const migrationSource: Knex.MigrationSource<string> = {
  getMigrations: async () => ['20260101000000_init'],
  getMigrationName: name => name,
  getMigration: async () => ({
    async up(knex: Knex) {
      await knex.raw('SELECT pg_sleep(1)');
      await knex.schema.createTable('things', table => {
        table.string('id').primary();
      });
    },
    async down(knex: Knex) {
      await knex.schema.dropTable('things');
    },
  }),
};

const migrate = { migrationSource, tableName: 'test__knex_migrations' };

const describeOnPostgres = databases.supports('POSTGRES_18')
  ? describe
  : describe.skip;

describeOnPostgres('serializeMigrations on Postgres', () => {
  it('fails one of two backends without the lock', async () => {
    const first = await databases.init('POSTGRES_18');
    const second = knexFactory(first.client.config);
    try {
      await expect(
        Promise.all(
          [first, second].map(client => client.migrate.latest(migrate)),
        ),
      ).rejects.toThrow();
    } finally {
      await second.destroy();
    }
  });

  it('runs the first migrations of two backends one after another', async () => {
    const first = await databases.init('POSTGRES_18');
    // A second backend: its own pool on the same, empty database.
    const second = knexFactory(first.client.config);
    try {
      const logger = mockLogger();
      const replicas = [first, second].map(client =>
        serializeMigrations(
          client,
          'catalog',
          logger as unknown as LoggerService,
        ),
      );

      await Promise.all(replicas.map(client => client.migrate.latest(migrate)));

      expect(await first('test__knex_migrations').count('* as n')).toEqual([
        { n: '1' },
      ]);
      expect(logger.info).toHaveBeenCalledWith(
        "Waiting for another backend's migrations of test__knex_migrations",
      );
    } finally {
      await second.destroy();
    }
  });
});

describe('serializeMigrations', () => {
  it('leaves a sqlite client as it is', () => {
    const sqlite = knexFactory({
      client: 'better-sqlite3',
      connection: ':memory:',
      useNullAsDefault: true,
    });
    const migrateOf = Object.getOwnPropertyDescriptor(sqlite, 'migrate');
    serializeMigrations(
      sqlite,
      'catalog',
      mockLogger() as unknown as LoggerService,
    );
    expect(Object.getOwnPropertyDescriptor(sqlite, 'migrate')).toEqual(
      migrateOf,
    );
    return sqlite.destroy();
  });
});
