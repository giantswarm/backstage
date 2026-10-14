import type {
  LifecycleService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { DatabaseManager } from '@backstage/backend-defaults/database';
import { ConfigReader } from '@backstage/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The carried patch .yarn/patches/@backstage-backend-defaults-npm-0.18.0-*.patch
// handles the rejection of the keepalive promise in getDatabase and drops a
// failed client from the manager's cache (upstream
// packages/backend-defaults/src/entrypoints/database/DatabaseManager.ts).
describe('DatabaseManager with the carried getDatabase patch', () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  const nodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    unhandled.length = 0;
    // The keepalive branch only runs outside tests.
    process.env.NODE_ENV = 'production';
    process.on('unhandledRejection', onUnhandled);
  });

  afterEach(() => {
    process.env.NODE_ENV = nodeEnv;
    process.off('unhandledRejection', onUnhandled);
  });

  function unreachableDatabase() {
    return DatabaseManager.fromConfig(
      new ConfigReader({
        backend: {
          database: {
            client: 'pg',
            // Nothing listens on port 1: every connection is refused.
            connection: {
              host: '127.0.0.1',
              port: 1,
              user: 'u',
              password: 'p',
            },
            knexConfig: { acquireConnectionTimeout: 2000 },
          },
        },
      }),
    ).forPlugin('catalog', {
      logger: { warn: jest.fn() } as unknown as LoggerService,
      lifecycle: { addShutdownHook: jest.fn() } as unknown as LifecycleService,
    });
  }

  it('leaves no unhandled rejection when the database refuses', async () => {
    await expect(unreachableDatabase().getClient()).rejects.toThrow();
    // Unhandled rejections are reported after the microtask queue drains.
    await new Promise(done => setImmediate(done));

    expect(unhandled).toEqual([]);
  });

  it('connects anew after a failed attempt', async () => {
    const database = unreachableDatabase();

    const first = await database.getClient().catch(error => error);
    const second = await database.getClient().catch(error => error);

    expect(first).toBeInstanceOf(Error);
    expect(second).toBeInstanceOf(Error);
    expect(second).not.toBe(first);
  });

  it('is regenerated or dropped with the next Backstage release', () => {
    // A Backstage bump moves @backstage/backend-defaults past 0.18.0, which the
    // patch's resolution pins: drop the patch once upstream carries the fix,
    // regenerate it (yarn patch) otherwise.
    const { version } = JSON.parse(
      readFileSync(resolve(__dirname, '../../../backstage.json'), 'utf8'),
    );
    expect(version).toBe('1.55.3');
  });
});
