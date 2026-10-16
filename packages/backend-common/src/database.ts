import {
  coreServices,
  createServiceFactory,
  DatabaseService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { DatabaseManager } from '@backstage/backend-defaults/database';
import { ConfigReader } from '@backstage/config';

/**
 * How long a plugin keeps trying to reach its database at startup before its
 * boot fails. Every attempt already waits up to knex's acquire timeout (60 s)
 * for a connection, so a database that comes up within an attempt is used at
 * once; the delay only spaces out attempts that fail fast.
 */
export const DATABASE_RETRY_DEADLINE_MS = 5 * 60 * 1000;
const DATABASE_RETRY_DELAY_MS = 5 * 1000;

type DatabaseClient = Awaited<ReturnType<DatabaseService['getClient']>>;

export interface RetryOptions {
  deadlineMs: number;
  delayMs: number;
  logger: LoggerService;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Connects through `connect`, a fresh attempt each time, until one succeeds
 * or the deadline passes; the last error is rethrown then.
 */
export async function connectWithRetry(
  connect: () => Promise<DatabaseClient>,
  {
    deadlineMs,
    delayMs,
    logger,
    now = Date.now,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  }: RetryOptions,
): Promise<DatabaseClient> {
  const deadline = now() + deadlineMs;
  for (let attempt = 1; ; attempt++) {
    try {
      const client = await connect();
      if (attempt > 1) {
        logger.info(`Database reachable after ${attempt} attempts`);
      }
      return client;
    } catch (error) {
      if (now() + delayMs >= deadline) {
        logger.error(
          `Database unreachable, giving up after ${attempt} attempts`,
          error as Error,
        );
        throw error;
      }
      logger.warn(
        `Database unreachable (attempt ${attempt}), retrying in ${
          delayMs / 1000
        }s`,
        error as Error,
      );
      await sleep(delayMs);
    }
  }
}

type MigrateConfig = { tableName?: string; schemaName?: string };

const MIGRATION_LOCK_POLL_MS = 1000;
const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Makes every `migrate.latest` and `migrate.up` of a PostgreSQL client wait
 * for a session advisory lock named after the plugin and its migrations
 * table, so backends started at once (a fresh install's replicas) migrate one
 * after another: knex creates its migrations tables unlocked and fails a
 * migration whose lock another backend holds. The lock is taken on a
 * connection of its own, outside the plugin's pool, which the migration
 * needs; it ends with the migration, or with the backend that holds it.
 * Other clients are returned unchanged.
 */
export function serializeMigrations(
  client: DatabaseClient,
  pluginId: string,
  logger: LoggerService,
): DatabaseClient {
  const knexClient = client.client;
  if (knexClient.dialect !== 'postgresql') {
    return client;
  }
  const migrateOf = Object.getOwnPropertyDescriptor(client, 'migrate')?.get;
  if (!migrateOf) {
    return client;
  }
  const locked =
    <A extends [MigrateConfig?, ...unknown[]], R>(
      run: (...args: A) => Promise<R>,
    ) =>
    async (...args: A): Promise<R> => {
      const { schemaName = '', tableName = 'knex_migrations' } = args[0] ?? {};
      const key = `backstage-migrations:${pluginId}:${schemaName}:${tableName}`;
      const connection = await knexClient.acquireRawConnection();
      try {
        // Polled, never a blocking pg_advisory_lock: a statement waiting for
        // the lock is an open transaction, and the holder's
        // CREATE INDEX CONCURRENTLY waits for every open transaction.
        for (let attempt = 0; ; attempt++) {
          const { rows } = await connection.query(
            'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
            [key],
          );
          if (rows[0].locked) {
            break;
          }
          if (attempt === 0) {
            logger.info(
              `Waiting for another backend's migrations of ${tableName}`,
            );
          }
          await sleep(MIGRATION_LOCK_POLL_MS);
        }
        return await run(...args);
      } finally {
        // Closing the session releases its advisory lock.
        await knexClient
          .destroyRawConnection(connection)
          .catch((error: Error) => {
            logger.warn('Closing the migration lock connection failed', error);
          });
      }
    };
  Object.defineProperty(client, 'migrate', {
    configurable: true,
    get() {
      const migrator = migrateOf.call(this);
      migrator.latest = locked(migrator.latest.bind(migrator));
      migrator.up = locked(migrator.up.bind(migrator));
      return migrator;
    },
  });
  return client;
}

/**
 * The database service of @backstage/backend-defaults, retrying a plugin's
 * first connection until the database is reachable and serializing its
 * migrations with other backends'. Without the retry a backend started
 * before its database (a CNPG primary still coming up) fails the plugin's
 * boot within a minute and never recovers; without the lock replicas started
 * at once on an empty database fail their first migrations and restart.
 */
export const databaseServiceFactory = createServiceFactory({
  service: coreServices.database,
  deps: {
    config: coreServices.rootConfig,
    lifecycle: coreServices.lifecycle,
    logger: coreServices.logger,
    pluginMetadata: coreServices.pluginMetadata,
    rootLifecycle: coreServices.rootLifecycle,
    rootLogger: coreServices.rootLogger,
  },
  async createRootContext({ config, rootLifecycle, rootLogger }) {
    // Upstream's fallback: in-memory sqlite without a database config.
    const databaseConfig = config.getOptional('backend.database')
      ? config
      : new ConfigReader({
          backend: {
            database: { client: 'better-sqlite3', connection: ':memory:' },
          },
        });
    return () =>
      DatabaseManager.fromConfig(databaseConfig, { rootLifecycle, rootLogger });
  },
  async factory({ pluginMetadata, lifecycle, logger }, createManager) {
    const forPlugin = () =>
      createManager().forPlugin(pluginMetadata.getId(), { lifecycle, logger });
    const first = forPlugin();
    let attempt: DatabaseService | undefined;
    let client: Promise<DatabaseClient> | undefined;
    return {
      migrations: first.migrations,
      getClient() {
        client ??= connectWithRetry(
          () => {
            // A manager keeps a plugin's failed client: retry on a new one.
            attempt = attempt ? forPlugin() : first;
            return attempt.getClient();
          },
          {
            deadlineMs: DATABASE_RETRY_DEADLINE_MS,
            delayMs: DATABASE_RETRY_DELAY_MS,
            logger,
          },
        ).then(connected =>
          serializeMigrations(connected, pluginMetadata.getId(), logger),
        );
        return client;
      },
    };
  },
});
