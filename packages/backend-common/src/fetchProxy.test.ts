import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { fetch } from 'undici';
import { fetchProxyDispatcher } from './fetchProxy';

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
