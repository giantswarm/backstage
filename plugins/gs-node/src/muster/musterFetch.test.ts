import { createServer, type Server } from 'node:http';
import { createServer as createNetServer, type AddressInfo } from 'node:net';
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from 'undici';
import { createMusterFetch, MUSTER_CONNECT_TIMEOUT_MS } from './musterFetch';

describe('createMusterFetch', () => {
  it('bounds the connection at five seconds by default', () => {
    expect(MUSTER_CONNECT_TIMEOUT_MS).toBe(5_000);
  });

  describe('without an egress proxy', () => {
    let server: Server;
    let url: string;

    beforeEach(async () => {
      server = createServer((_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end('{"jsonrpc":"2.0","id":1,"result":{}}');
      });
      await new Promise<void>(resolve => server.listen(0, resolve));
      url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
    });

    afterEach(async () => {
      await new Promise(resolve => server.close(resolve));
    });

    it('reaches muster on its own connections', async () => {
      const response = await createMusterFetch()(url, { method: 'POST' });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        jsonrpc: '2.0',
        id: 1,
        result: {},
      });
    });
  });

  it('gives up on a connection that does not open within the timeout', async () => {
    // Accepts the TCP connection and never answers the TLS handshake, which
    // undici counts as part of connecting.
    const silent = createNetServer(() => {});
    await new Promise<void>(resolve => silent.listen(0, '127.0.0.1', resolve));
    const { port } = silent.address() as AddressInfo;
    const started = Date.now();
    try {
      await expect(
        createMusterFetch(200)(`https://127.0.0.1:${port}/mcp`, {
          method: 'POST',
        }),
      ).rejects.toMatchObject({
        cause: { code: 'UND_ERR_CONNECT_TIMEOUT' },
      });
      expect(Date.now() - started).toBeLessThan(2_000);
    } finally {
      silent.close();
    }
  });

  describe('behind an egress proxy', () => {
    const previous = getGlobalDispatcher();
    let proxy: MockAgent;

    beforeEach(() => {
      proxy = new MockAgent();
      proxy.disableNetConnect();
      setGlobalDispatcher(proxy);
    });

    afterEach(async () => {
      setGlobalDispatcher(previous);
      await proxy.close();
    });

    it('goes through the global dispatcher rather than around it', async () => {
      proxy
        .get('https://muster.example')
        .intercept({ path: '/mcp', method: 'POST' })
        .reply(200, { jsonrpc: '2.0', id: 1, result: {} });

      const response = await createMusterFetch()('https://muster.example/mcp', {
        method: 'POST',
      });

      expect(response.status).toBe(200);
      proxy.assertNoPendingInterceptors();
    });
  });
});
