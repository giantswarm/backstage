import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { fetch } from 'undici';
import { configureFetchProxy, fetchProxyDispatcher } from './fetchProxy';

// A forward proxy for plain-HTTP targets answers the request itself: the
// request line carries the absolute URL. The upstream answers with its path.
async function listen(name: string, seen: string[]) {
  const server = http.createServer((req, res) => {
    seen.push(`${name} ${req.url}`);
    res.end(name);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

const port = (server: http.Server) => (server.address() as AddressInfo).port;

describe('fetchProxyDispatcher', () => {
  const seen: string[] = [];
  let proxy: http.Server;
  let upstream: http.Server;

  beforeAll(async () => {
    proxy = await listen('proxy', seen);
    upstream = await listen('upstream', seen);
  });

  afterAll(() => {
    proxy.close();
    upstream.close();
  });

  beforeEach(() => {
    seen.length = 0;
  });

  function get(host: string, env: NodeJS.ProcessEnv) {
    const dispatcher = fetchProxyDispatcher(env);
    return fetch(`http://${host}:${port(upstream)}/catalog-info.yaml`, {
      dispatcher,
    }).then(res => res.text());
  }

  it('routes fetch through GLOBAL_AGENT_HTTP_PROXY', async () => {
    const proxyUrl = `http://127.0.0.1:${port(proxy)}`;

    await expect(
      get('127.0.0.1', { GLOBAL_AGENT_HTTP_PROXY: proxyUrl }),
    ).resolves.toBe('proxy');
    expect(seen).toEqual([
      `proxy http://127.0.0.1:${port(upstream)}/catalog-info.yaml`,
    ]);
  });

  it('goes direct to a host GLOBAL_AGENT_NO_PROXY exempts', async () => {
    const proxyUrl = `http://127.0.0.1:${port(proxy)}`;
    const env = {
      GLOBAL_AGENT_HTTP_PROXY: proxyUrl,
      GLOBAL_AGENT_NO_PROXY: '127.0.0.1,*.svc',
    };

    await expect(get('127.0.0.1', env)).resolves.toBe('upstream');
    expect(seen).toEqual(['upstream /catalog-info.yaml']);
  });

  it('ignores a NO_PROXY that GLOBAL_AGENT_NO_PROXY does not carry', async () => {
    const proxyUrl = `http://127.0.0.1:${port(proxy)}`;
    const env = { GLOBAL_AGENT_HTTP_PROXY: proxyUrl, NO_PROXY: '127.0.0.1' };

    await expect(get('127.0.0.1', env)).resolves.toBe('proxy');
  });

  it('configures a proxy from GLOBAL_AGENT_HTTPS_PROXY alone', () => {
    expect(
      fetchProxyDispatcher({ GLOBAL_AGENT_HTTPS_PROXY: 'http://proxy:3128' }),
    ).toBeDefined();
  });

  it('leaves fetch alone without a proxy or under NODE_USE_ENV_PROXY', () => {
    expect(fetchProxyDispatcher({})).toBeUndefined();
    expect(
      fetchProxyDispatcher({ GLOBAL_AGENT_HTTP_PROXY: '' }),
    ).toBeUndefined();
    expect(
      fetchProxyDispatcher({
        GLOBAL_AGENT_HTTP_PROXY: 'http://proxy:3128',
        NODE_USE_ENV_PROXY: '1',
      }),
    ).toBeUndefined();
  });
});

describe('configureFetchProxy', () => {
  // The Node releases and the undici each bundles (deps/undici in nodejs/node).
  const node = (version: string, undici: string) => ({
    node: version,
    undici,
  });
  const envProxy = {
    NODE_USE_ENV_PROXY: '1',
    HTTPS_PROXY: 'http://proxy:3128',
  };

  it.each([
    ['22.22.0', '6.23.0'],
    ['24.16.0', '7.25.0'],
    ['25.9.0', '7.24.4'],
  ])(
    'fails under NODE_USE_ENV_PROXY on Node %s (undici %s)',
    (version, undici) => {
      expect(() =>
        configureFetchProxy(envProxy, node(version, undici)),
      ).toThrow(
        `NODE_USE_ENV_PROXY=1 needs Node 24.17.0 or later (Node 25 does not qualify). This is Node ${version}`,
      );
    },
  );

  it.each([
    ['24.17.0', '7.28.0'],
    ['24.22.2', '7.30.1'],
    ['26.0.0', '8.0.2'],
  ])('accepts NODE_USE_ENV_PROXY on Node %s (undici %s)', (version, undici) => {
    expect(() =>
      configureFetchProxy(envProxy, node(version, undici)),
    ).not.toThrow();
  });

  it('does not check the Node version without NODE_USE_ENV_PROXY', () => {
    expect(() =>
      configureFetchProxy({}, node('22.22.0', '6.23.0')),
    ).not.toThrow();
  });
});
