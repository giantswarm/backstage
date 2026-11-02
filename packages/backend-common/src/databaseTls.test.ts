import type {
  LifecycleService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { DatabaseManager } from '@backstage/backend-defaults/database';
import { ConfigSources, FileConfigSource } from '@backstage/config-loader';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type AddressInfo, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// The pg block the chart renders with `database.engine: postgresql`, loaded
// the way the pod loads it: the file at /app/app-config-database.yaml with the
// CNPG cluster's CA mounted beside it.
const chartDatabaseConfig = resolve(
  __dirname,
  '../../../helm/backstage/files/app-config-database.yaml',
);

// $file trims the file's trailing newline.
const ca = '-----BEGIN CERTIFICATE-----\nlab\n-----END CERTIFICATE-----';

// The int32 code of the PostgreSQL SSLRequest message, which a client sends
// instead of its StartupMessage when it connects with TLS.
const SSL_REQUEST_CODE = 80877103;

describe('the chart database config', () => {
  let dir: string;
  let server: Server;
  let firstMessage: Promise<Buffer>;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'app-'));
    copyFileSync(chartDatabaseConfig, join(dir, 'app-config-database.yaml'));
    mkdirSync(join(dir, 'database-ca-certificate'));
    writeFileSync(join(dir, 'database-ca-certificate', 'ca.crt'), `${ca}\n`);

    // A server that refuses TLS, as a plaintext-only PostgreSQL does, and
    // keeps the client's first message.
    server = createServer();
    firstMessage = new Promise(received =>
      server.on('connection', socket =>
        socket.once('data', data => {
          received(data);
          socket.end('N');
        }),
      ),
    );
    await new Promise<void>(listening =>
      server.listen(0, '127.0.0.1', listening),
    );
  });

  afterEach(async () => {
    await new Promise(closed => server.close(closed));
    rmSync(dir, { recursive: true, force: true });
  });

  async function loadConfig() {
    const env: Record<string, string> = {
      POSTGRES_HOST: '127.0.0.1',
      POSTGRES_PORT: String((server.address() as AddressInfo).port),
      POSTGRES_USER: 'app',
      POSTGRES_PASSWORD: 'p',
    };
    return ConfigSources.toConfig(
      FileConfigSource.create({
        path: join(dir, 'app-config-database.yaml'),
        watch: false,
        substitutionFunc: async name => env[name],
      }),
    );
  }

  it('verifies the server against the CA mounted beside it', async () => {
    const config = await loadConfig();

    expect(config.get('backend.database.connection.ssl')).toEqual({
      ca,
      rejectUnauthorized: true,
    });
    config.close();
  });

  it('opens every connection with TLS', async () => {
    const config = await loadConfig();
    const database = DatabaseManager.fromConfig(config).forPlugin('catalog', {
      logger: { warn: jest.fn() } as unknown as LoggerService,
      lifecycle: { addShutdownHook: jest.fn() } as unknown as LifecycleService,
    });

    await expect(database.getClient()).rejects.toThrow(
      'The server does not support SSL connections',
    );
    const message = await firstMessage;
    expect(message.readInt32BE(0)).toBe(8);
    expect(message.readInt32BE(4)).toBe(SSL_REQUEST_CODE);
    config.close();
  });
});
