import {
  type DatabaseService,
  resolvePackagePath,
} from '@backstage/backend-plugin-api';
import type { Knex } from 'knex';

const migrationsDir = resolvePackagePath(
  '@giantswarm/backstage-plugin-catalog-backend-module-gs',
  'migrations',
);

/** The module's database client, with its migrations applied. */
export async function getMigratedClient(
  database: DatabaseService,
): Promise<Knex> {
  const db = await database.getClient();
  if (!database.migrations?.skip) {
    await db.migrate.latest({
      directory: migrationsDir,
      tableName: 'knex_migrations_catalog_module_gs',
    });
  }
  return db;
}
