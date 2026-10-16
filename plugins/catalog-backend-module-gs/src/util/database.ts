import {
  type DatabaseService,
  resolvePackagePath,
} from '@backstage/backend-plugin-api';
import type { Knex } from 'knex';

const migrationsDir = resolvePackagePath(
  '@giantswarm/backstage-plugin-catalog-backend-module-gs',
  'migrations',
);

const migrated = new WeakMap<DatabaseService, Promise<Knex>>();

/**
 * The module's database client, with its migrations applied. Migrations run
 * once per `DatabaseService`, however many features share it.
 */
export function getMigratedClient(database: DatabaseService): Promise<Knex> {
  let client = migrated.get(database);
  if (!client) {
    client = migrate(database);
    client.catch(() => migrated.delete(database));
    migrated.set(database, client);
  }
  return client;
}

async function migrate(database: DatabaseService): Promise<Knex> {
  const db = await database.getClient();
  if (!database.migrations?.skip) {
    await db.migrate.latest({
      directory: migrationsDir,
      tableName: 'knex_migrations_catalog_module_gs',
    });
  }
  return db;
}
