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

/**
 * The database service of @backstage/backend-defaults, retrying a plugin's
 * first connection until the database is reachable. Without it a backend
 * started before its database (a CNPG primary still coming up) fails the
 * plugin's boot within a minute and never recovers.
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
        );
        return client;
      },
    };
  },
});
