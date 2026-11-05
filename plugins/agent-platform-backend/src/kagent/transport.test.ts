import { Code, ConnectError, createClient } from '@connectrpc/connect';
import { connectNodeAdapter } from '@connectrpc/connect-node';
import http2 from 'http2';
import net from 'net';
import { isSocketFailure } from './errors';
import { SystemService } from './gen/kagent/api/v1alpha1/system_pb';
import {
  createKagentTransport,
  KAGENT_PING_INTERVAL_MS,
  KAGENT_PING_TIMEOUT_MS,
} from './transport';
import { DEFAULT_KAGENT_TIMEOUT_MS } from '../KagentClient';

/**
 * A TCP proxy in front of the controller that can make the connections it
 * carries go silent: bytes are dropped both ways and nothing is closed, the
 * way a load balancer or NAT that forgot a flow behaves. Connections opened
 * afterwards are carried as usual.
 */
async function silenceableProxy(target: number) {
  const pairs: Array<{ silent: boolean; sockets: net.Socket[] }> = [];
  const server = net.createServer(client => {
    const upstream = net.connect(target, '127.0.0.1');
    const pair = { silent: false, sockets: [client, upstream] };
    pairs.push(pair);
    client.on('data', chunk => {
      if (!pair.silent) {
        upstream.write(chunk);
      }
    });
    upstream.on('data', chunk => {
      if (!pair.silent) {
        client.write(chunk);
      }
    });
    client.on('error', () => undefined);
    upstream.on('error', () => undefined);
    client.on('close', () => upstream.destroy());
    upstream.on('close', () => client.destroy());
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    port: (server.address() as net.AddressInfo).port,
    connections: () => pairs.length,
    silenceAll() {
      for (const pair of pairs) {
        pair.silent = true;
      }
    },
    async close() {
      for (const pair of pairs) {
        pair.sockets.forEach(socket => socket.destroy());
      }
      await new Promise(resolve => server.close(resolve));
    },
  };
}

describe('createKagentTransport', () => {
  let controller: http2.Http2Server;
  let proxy: Awaited<ReturnType<typeof silenceableProxy>>;

  beforeEach(async () => {
    controller = http2.createServer(
      connectNodeAdapter({
        routes: router =>
          router.service(SystemService, {
            getVersion: () => ({ kagentVersion: 'v1' }),
            getCurrentUser: async (_request, context) => {
              if (context.requestHeader.get('x-fail') === 'slow') {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
              throw new ConnectError('database down', Code.Internal);
            },
          }),
      }),
    );
    await new Promise<void>(resolve =>
      controller.listen(0, '127.0.0.1', resolve),
    );
    proxy = await silenceableProxy(
      (controller.address() as net.AddressInfo).port,
    );
  });

  afterEach(async () => {
    await proxy.close();
    await new Promise(resolve => controller.close(resolve));
  });

  it('keeps its pings well under the request timeout', () => {
    expect(KAGENT_PING_INTERVAL_MS + KAGENT_PING_TIMEOUT_MS).toBeLessThan(
      DEFAULT_KAGENT_TIMEOUT_MS,
    );
  });

  it('replaces a connection that went silent before the call on it times out', async () => {
    const system = createClient(
      SystemService,
      createKagentTransport({
        name: 'gazelle',
        apiBaseUrl: `http://127.0.0.1:${proxy.port}`,
      }),
    );
    const call = () =>
      system.getVersion({}, { timeoutMs: DEFAULT_KAGENT_TIMEOUT_MS });

    await expect(call()).resolves.toMatchObject({ kagentVersion: 'v1' });
    expect(proxy.connections()).toBe(1);

    proxy.silenceAll();
    const started = Date.now();
    const error = ConnectError.from(await call().catch((e: unknown) => e));
    const elapsed = Date.now() - started;

    // The ping found the connection dead: not the call's own deadline.
    expect(error.code).toBe(Code.Unavailable);
    expect(elapsed).toBeLessThan(DEFAULT_KAGENT_TIMEOUT_MS);
    expect(elapsed).toBeGreaterThanOrEqual(KAGENT_PING_INTERVAL_MS);
    // Reported as an unavailable kagent (a 500 the router logs once), not
    // silenced as one that is not deployed.
    expect(isSocketFailure(error)).toBe(false);

    // The next call opens a new connection instead of waiting on the dead one.
    await expect(call()).resolves.toMatchObject({ kagentVersion: 'v1' });
    expect(proxy.connections()).toBe(2);
  }, 20_000);

  describe('with a call duration histogram', () => {
    function recorded(apiBaseUrl = `http://127.0.0.1:${proxy.port}`) {
      const histogram = { record: jest.fn() };
      const system = createClient(
        SystemService,
        createKagentTransport(
          { name: 'gazelle', apiBaseUrl },
          { callDuration: histogram },
        ),
      );
      return { histogram, system };
    }

    it('records a call that succeeded', async () => {
      const { histogram, system } = recorded();
      await system.getVersion({});

      expect(histogram.record).toHaveBeenCalledTimes(1);
      const [seconds, attributes] = histogram.record.mock.calls[0];
      expect(seconds).toBeGreaterThan(0);
      expect(seconds).toBeLessThan(5);
      expect(attributes).toEqual({
        installation: 'gazelle',
        method: 'SystemService/GetVersion',
        outcome: 'ok',
      });
    });

    it('records a failed call by its code', async () => {
      const { histogram, system } = recorded();
      await expect(system.getCurrentUser({})).rejects.toThrow('database down');

      expect(histogram.record).toHaveBeenCalledWith(expect.any(Number), {
        installation: 'gazelle',
        method: 'SystemService/GetCurrentUser',
        outcome: 'internal',
      });
    });

    it('records our own deadline as a timeout, and how long it waited', async () => {
      const { histogram, system } = recorded();
      await expect(
        system.getCurrentUser(
          {},
          { timeoutMs: 100, headers: { 'x-fail': 'slow' } },
        ),
      ).rejects.toMatchObject({ code: Code.DeadlineExceeded });

      const [seconds, attributes] = histogram.record.mock.calls[0];
      expect(attributes.outcome).toBe('timeout');
      expect(seconds).toBeGreaterThanOrEqual(0.09);
    });

    it('records a controller nobody answers for as unreachable', async () => {
      const closed = net.createServer();
      await new Promise<void>(resolve =>
        closed.listen(0, '127.0.0.1', resolve),
      );
      const { port } = closed.address() as net.AddressInfo;
      await new Promise(resolve => closed.close(resolve));

      const { histogram, system } = recorded(`http://127.0.0.1:${port}`);
      await expect(system.getVersion({})).rejects.toBeDefined();

      expect(histogram.record).toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({ outcome: 'unreachable' }),
      );
    });
  });
});
