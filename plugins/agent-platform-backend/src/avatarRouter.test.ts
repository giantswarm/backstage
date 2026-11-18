import { ConfigReader } from '@backstage/config';
import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { mockServices } from '@backstage/backend-test-utils';
import express from 'express';
import type { lookup as dnsLookup } from 'node:dns';
import { createServer as createHttpServer, type Server } from 'node:http';
import { createServer as createTcpServer, type AddressInfo } from 'node:net';
import request from 'supertest';
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from 'undici';
import {
  errorCode,
  isProbeTimeout,
  type LoopUtilizationMeter,
} from '@giantswarm/backstage-plugin-gs-node';
import {
  AVATAR_SIZES,
  createAvatarFetch,
  createAvatarRouter,
} from './avatarRouter';

const config = new ConfigReader({
  gs: {
    installations: {
      gazelle: { baseDomain: 'gazelle.example' },
      bare: {},
    },
  },
});

/** The PNG signature: enough of an image for the proxy to forward. */
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const imageHeaders = {
  'Content-Type': 'image/png',
  'Cache-Control': 'public, max-age=86400',
  ETag: '"v1-go-developer"',
};

function upstream(
  answer: () => Response | Promise<Response> = () =>
    new Response(png, { status: 200, headers: imageHeaders }),
) {
  return jest.fn(async (_url: string, _init: RequestInit) => answer());
}

/** An event loop with time to spare, whatever Jest's is doing. */
const idleLoop: LoopUtilizationMeter = () => () => 0.1;

function app(
  fetchFn: jest.Mock,
  logger: ReturnType<
    typeof mockServices.logger.mock
  > = mockServices.logger.mock(),
  now: () => number = Date.now,
  loopMeter: LoopUtilizationMeter = idleLoop,
) {
  const router = createAvatarRouter({
    config,
    logger,
    fetchFn: fetchFn as unknown as typeof fetch,
    now,
    loopMeter,
  });
  const middleware = MiddlewareFactory.create({
    logger,
    config: new ConfigReader({}),
  });
  return express().use(router).use(middleware.error());
}

describe('GET /avatars/:installation/v1/...', () => {
  it('fetches a sized avatar from the installation’s own host and forwards the image as it came', async () => {
    const fetchFn = upstream();

    const response = await request(app(fetchFn))
      .get('/avatars/gazelle/v1/48/go-developer.png')
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('image/png');
    expect(response.headers['cache-control']).toBe('public, max-age=86400');
    expect(response.headers.etag).toBe('"v1-go-developer"');
    expect(Buffer.from(response.body)).toEqual(png);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://avatars.gazelle.example/v1/48/go-developer.png');
    // Nothing of the browser's request travels along, and a redirect would
    // be a hop off the allowlisted host.
    // Any image: a narrower Accept gave a negotiating proxy a reason to
    // answer 406 (QA round 1).
    expect(init.headers).toEqual({ Accept: 'image/*' });
    expect(init.redirect).toBe('error');
  });

  it.each([
    ['the default size', '/v1/go-developer.png'],
    ['the preview route', '/v1/preview/go-developer.png'],
    ['the preview route with a size', '/v1/preview/128/go-developer.png'],
  ])('maps %s onto the same path of the avatars host', async (_, path) => {
    const fetchFn = upstream();

    const response = await request(app(fetchFn)).get(`/avatars/gazelle${path}`);

    expect(response.status).toBe(200);
    expect(fetchFn.mock.calls[0][0]).toBe(
      `https://avatars.gazelle.example${path}`,
    );
  });

  it('forwards the preview route’s no-store so a throwaway seed enters no cache', async () => {
    const fetchFn = upstream(
      () =>
        new Response(png, {
          status: 200,
          headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
        }),
    );

    const response = await request(app(fetchFn)).get(
      '/avatars/gazelle/v1/preview/96/probe.png',
    );

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.etag).toBeUndefined();
  });

  it('revalidates a cached avatar through the upstream and answers 304', async () => {
    const fetchFn = upstream(
      () =>
        new Response(null, {
          status: 304,
          headers: { ETag: '"v1-go-developer"' },
        }),
    );

    const response = await request(app(fetchFn))
      .get('/avatars/gazelle/v1/go-developer.png')
      .set('If-None-Match', '"v1-go-developer"');

    expect(response.status).toBe(304);
    expect(response.headers.etag).toBe('"v1-go-developer"');
    expect(fetchFn.mock.calls[0][1].headers).toEqual({
      Accept: 'image/*',
      'If-None-Match': '"v1-go-developer"',
    });
  });

  it.each([
    ['an installation the portal does not know', '/avatars/nope/v1/x.png', 404],
    ['an installation without a base domain', '/avatars/bare/v1/x.png', 404],
    ['a size the endpoint does not serve', '/avatars/gazelle/v1/64/x.png', 400],
    ['a size spelled in another way', '/avatars/gazelle/v1/0x30/x.png', 400],
    ['a file that is not a png', '/avatars/gazelle/v1/x.svg', 400],
    ['a name that is not a DNS label', '/avatars/gazelle/v1/Go_Dev.png', 400],
    ['a slash hidden in the name', '/avatars/gazelle/v1/a%2Fb.png', 400],
    ['a path climbing out', '/avatars/gazelle/v1/..%2F..%2Fx.png', 400],
    [
      'more segments than the endpoint has',
      '/avatars/gazelle/v1/preview/48/extra/x.png',
      400,
    ],
    [
      'preview where a size belongs',
      '/avatars/gazelle/v1/preview/preview/x.png',
      400,
    ],
  ])('refuses %s without fetching anything', async (_, path, status) => {
    const fetchFn = upstream();

    const response = await request(app(fetchFn)).get(path);

    expect(response.status).toBe(status);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('answers 404 when the installation has no avatar for the name', async () => {
    const fetchFn = upstream(() => new Response('nope', { status: 404 }));

    const response = await request(app(fetchFn)).get(
      '/avatars/gazelle/v1/go-developer.png',
    );

    expect(response.status).toBe(404);
  });

  /** The catch-all MCP route of an installation without DiceBear. */
  const catchAll = () =>
    new Response('mcp: client must accept text/event-stream', {
      status: 406,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });

  it.each([
    [
      'a route that is not the renderer answers its avatars host',
      catchAll,
      /serves no avatars: its avatars host answered 406 with text\/plain/,
    ],
    [
      'its avatars host has no address',
      () =>
        Promise.reject(
          new TypeError('fetch failed', {
            cause: Object.assign(new Error('getaddrinfo ENOTFOUND'), {
              code: 'ENOTFOUND',
            }),
          }),
        ),
      /serves no avatars: its avatars host has no address \(ENOTFOUND\)/,
    ],
  ])(
    'answers an agent without an avatar 404, not 502, when %s',
    async (_, answer, reason) => {
      const logger = mockServices.logger.mock();
      const fetchFn = upstream(answer);

      const response = await request(app(fetchFn, logger)).get(
        '/avatars/gazelle/v1/48/e2e-agent.png',
      );

      expect(response.status).toBe(404);
      expect(response.headers['cache-control']).toBe('private, max-age=60');
      expect(response.body.error.name).toBe('NotFoundError');
      expect(response.body.error.message).toMatch(reason);
      // Handled, not a fault: visible in the logs, nothing for Sentry.
      expect(logger.info).toHaveBeenCalledWith(
        'The installation serves no avatars',
        expect.objectContaining({ installation: 'gazelle' }),
      );
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it('asks an installation that serves no avatars again only after a minute', async () => {
    const logger = mockServices.logger.mock();
    const fetchFn = upstream(catchAll);
    let clock = 1_000_000;
    const server = app(fetchFn, logger, () => clock);

    await request(server).get('/avatars/gazelle/v1/48/a.png');
    clock += 30_000;
    const cached = await request(server).get('/avatars/gazelle/v1/96/b.png');

    expect(cached.status).toBe(404);
    expect(cached.headers['cache-control']).toBe('private, max-age=30');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledTimes(1);

    clock += 30_000;
    await request(server).get('/avatars/gazelle/v1/48/a.png');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  /** undici's way of saying the connection could not be made. */
  const connectFailure = (code: string, message: string) => () =>
    Promise.reject(
      new TypeError('fetch failed', {
        cause: Object.assign(new Error(message), { code }),
      }),
    );

  it.each([
    [
      'no connection within the connect timeout',
      'UND_ERR_CONNECT_TIMEOUT',
      'Connect Timeout Error (attempted address: 10.0.0.1:443, timeout: 3000ms)',
    ],
    ['a host that is down', 'EHOSTDOWN', 'connect EHOSTDOWN 10.0.0.1:443'],
    [
      'no route to the host',
      'EHOSTUNREACH',
      'connect EHOSTUNREACH 10.0.0.1:443',
    ],
    [
      'no route to the network',
      'ENETUNREACH',
      'connect ENETUNREACH 10.0.0.1:443',
    ],
  ])(
    'answers 404 at once, for five minutes, when its avatars host cannot be connected to: %s',
    async (_, code, message) => {
      const logger = mockServices.logger.mock();
      const fetchFn = upstream(connectFailure(code, message));

      const response = await request(app(fetchFn, logger)).get(
        '/avatars/gazelle/v1/48/e2e-agent.png',
      );

      expect(response.status).toBe(404);
      expect(response.headers['cache-control']).toBe('private, max-age=300');
      expect(response.body.error.name).toBe('NotFoundError');
      expect(response.body.error.message).toBe(
        `The avatar service of 'gazelle' cannot be connected to (${code}).`,
      );
      // The code reaches the browser, the address does not.
      expect(response.body.error.message).not.toContain('10.0.0.1');
      // The network, not a renderer in trouble: in the logs, not in Sentry.
      expect(logger.info).toHaveBeenCalledWith(
        'The avatar service cannot be connected to',
        expect.objectContaining({
          installation: 'gazelle',
          url: 'https://avatars.gazelle.example/v1/48/e2e-agent.png',
          code,
        }),
      );
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it('asks an unreachable installation again after five minutes, and forwards its avatars once it is back', async () => {
    const logger = mockServices.logger.mock();
    let reachable = false;
    const fetchFn = upstream(() =>
      reachable
        ? new Response(png, { status: 200, headers: imageHeaders })
        : connectFailure('UND_ERR_CONNECT_TIMEOUT', 'Connect Timeout Error')(),
    );
    let clock = 1_000_000;
    const server = app(fetchFn, logger, () => clock);

    await request(server).get('/avatars/gazelle/v1/48/a.png');
    clock += 4 * 60_000;
    reachable = true;
    const cached = await request(server).get('/avatars/gazelle/v1/96/b.png');

    // Within the period: answered from the finding, nothing fetched, nothing
    // logged again.
    expect(cached.status).toBe(404);
    expect(cached.headers['cache-control']).toBe('private, max-age=60');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledTimes(1);

    clock += 60_000;
    const back = await request(server).get('/avatars/gazelle/v1/48/a.png');

    expect(back.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it('logs the avatars of one page that all find an installation unreachable once', async () => {
    const logger = mockServices.logger.mock();
    let fail: () => void = () => undefined;
    const failed = new Promise<void>(resolve => {
      fail = resolve;
    });
    // Every fetch waits until the last one has started, as when a page asks
    // for its avatars at once.
    const fetchFn = upstream(async () => {
      if (fetchFn.mock.calls.length === 3) {
        fail();
      }
      await failed;
      return connectFailure('EHOSTUNREACH', 'connect EHOSTUNREACH')();
    });
    const server = app(fetchFn, logger);

    const responses = await Promise.all(
      ['a', 'b', 'c'].map(name =>
        request(server).get(`/avatars/gazelle/v1/48/${name}.png`),
      ),
    );

    expect(responses.map(response => response.status)).toEqual([404, 404, 404]);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it('keeps the first finding of a page when a later avatar finds another one', async () => {
    const logger = mockServices.logger.mock();
    let release: () => void = () => undefined;
    const released = new Promise<void>(resolve => {
      release = resolve;
    });
    let started: () => void = () => undefined;
    const inFlight = new Promise<void>(resolve => {
      started = resolve;
    });
    // `a` finds no avatars served; `b`, in flight then, finds no connection.
    const fetchFn = upstream(async () => {
      const url = String(fetchFn.mock.calls[fetchFn.mock.calls.length - 1][0]);
      if (url.endsWith('/a.png')) {
        return catchAll();
      }
      started();
      await released;
      return connectFailure('EHOSTUNREACH', 'connect EHOSTUNREACH')();
    });
    let clock = 1_000_000;
    const server = app(fetchFn, logger, () => clock);

    const second = request(server).get('/avatars/gazelle/v1/48/b.png').then();
    await inFlight;
    const first = await request(server).get('/avatars/gazelle/v1/48/a.png');
    clock += 10_000;
    release();
    const straggler = await second;

    expect(first.body.error.message).toMatch(/serves no avatars/);
    expect(straggler.body.error.message).toMatch(/serves no avatars/);
    expect(straggler.headers['cache-control']).toBe('private, max-age=50');
    expect(logger.info).toHaveBeenCalledTimes(1);

    // Still the first finding's minute, not five from the straggler.
    clock += 50_000;
    await request(server).get('/avatars/gazelle/v1/48/a.png');
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('records nothing for a connect timeout while this process was too busy to notice the connection', async () => {
    const logger = mockServices.logger.mock();
    const fetchFn = upstream(
      connectFailure('UND_ERR_CONNECT_TIMEOUT', 'Connect Timeout Error'),
    );
    const starved: LoopUtilizationMeter = () => () => 0.95;
    const server = app(fetchFn, logger, Date.now, starved);

    const response = await request(server).get('/avatars/gazelle/v1/48/a.png');
    await request(server).get('/avatars/gazelle/v1/48/a.png');

    // The initials now, and the next avatar asks again.
    expect(response.status).toBe(404);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledWith(
      'The avatar service cannot be connected to while this process was busy',
      expect.objectContaining({ installation: 'gazelle' }),
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('records a host without a route even while this process was busy: no timer decided it', async () => {
    const fetchFn = upstream(
      connectFailure('EHOSTUNREACH', 'connect EHOSTUNREACH'),
    );
    const starved: LoopUtilizationMeter = () => () => 0.95;
    const server = app(fetchFn, undefined, Date.now, starved);

    const response = await request(server).get('/avatars/gazelle/v1/48/a.png');
    await request(server).get('/avatars/gazelle/v1/48/a.png');

    expect(response.headers['cache-control']).toBe('private, max-age=300');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('keeps asking another installation while one is unreachable', async () => {
    const fetchFn = upstream(async () => {
      const url = String(fetchFn.mock.calls[fetchFn.mock.calls.length - 1][0]);
      return url.includes('gazelle')
        ? connectFailure('EHOSTUNREACH', 'connect EHOSTUNREACH')()
        : new Response(png, { status: 200, headers: imageHeaders });
    });
    const twoInstallations = new ConfigReader({
      gs: {
        installations: {
          gazelle: { baseDomain: 'gazelle.example' },
          other: { baseDomain: 'other.example' },
        },
      },
    });
    const logger = mockServices.logger.mock();
    const server = express()
      .use(
        createAvatarRouter({
          config: twoInstallations,
          logger,
          fetchFn: fetchFn as unknown as typeof fetch,
        }),
      )
      .use(
        MiddlewareFactory.create({
          logger,
          config: new ConfigReader({}),
        }).error(),
      );

    expect(
      (await request(server).get('/avatars/gazelle/v1/48/a.png')).status,
    ).toBe(404);
    expect(
      (await request(server).get('/avatars/other/v1/48/a.png')).status,
    ).toBe(200);
  });

  it('releases the connection of an answer it does not forward', async () => {
    const cancel = jest.fn(async () => undefined);
    const fetchFn = upstream(() => {
      const response = catchAll();
      jest.spyOn(response.body!, 'cancel').mockImplementation(cancel);
      return response;
    });

    await request(app(fetchFn)).get('/avatars/gazelle/v1/48/a.png');

    expect(cancel).toHaveBeenCalled();
  });

  it.each<[string, () => Response | Promise<Response>, RegExp]>([
    [
      'answers an error',
      () => new Response('down', { status: 503 }),
      /answered 503/,
    ],
    // A renderer or a gateway in trouble, not an installation without one.
    ...[400, 401, 403, 422, 429].map(
      status =>
        [
          `answers ${status}`,
          () => new Response('no', { status }),
          new RegExp(`answered ${status}`),
        ] as [string, () => Response, RegExp],
    ),
    [
      'answers something that is not an image',
      () =>
        new Response('<html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      /text\/html rather than a raster image/,
    ],
    [
      // An SVG can carry script and would be served same-origin.
      'answers an SVG',
      () =>
        new Response('<svg/>', {
          status: 200,
          headers: { 'Content-Type': 'image/svg+xml' },
        }),
      /image\/svg\+xml rather than a raster image/,
    ],
    [
      'declares more bytes than an avatar has',
      () =>
        new Response(png, {
          status: 200,
          headers: {
            'Content-Type': 'image/png',
            'Content-Length': String(3 * 1024 * 1024),
          },
        }),
      /declared 3145728 bytes/,
    ],
    [
      'cannot be reached',
      () => Promise.reject(new TypeError('fetch failed')),
      /fetch failed/,
    ],
    [
      // The address was reached and nothing listens there: a gateway that is
      // down, not a network path that is missing.
      'refuses the connection',
      connectFailure('ECONNREFUSED', 'connect ECONNREFUSED 10.0.0.1:443'),
      /fetch failed/,
    ],
    [
      // undici reports a timeout while connecting as its own code: this is
      // an established connection that timed out.
      'times out an established connection',
      connectFailure('ETIMEDOUT', 'read ETIMEDOUT'),
      /fetch failed/,
    ],
    [
      // Connected: something answered there and hung up.
      'resets the connection',
      connectFailure('ECONNRESET', 'read ECONNRESET'),
      /fetch failed/,
    ],
    [
      'presents a certificate this backend does not trust',
      connectFailure(
        'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
        'unable to verify the first certificate',
      ),
      /fetch failed/,
    ],
  ])(
    'answers 502 with the reason when the avatar service %s',
    async (_, answer, reason) => {
      const fetchFn = upstream(answer);

      const response = await request(app(fetchFn)).get(
        '/avatars/gazelle/v1/go-developer.png',
      );

      expect(response.status).toBe(502);
      expect(response.body.error.message).toMatch(reason);
    },
  );

  it.each(['image/jpeg', 'image/gif', 'image/webp', 'IMAGE/PNG; charset=x'])(
    'forwards a raster image sent as %s',
    async contentType => {
      const fetchFn = upstream(
        () =>
          new Response(png, {
            status: 200,
            headers: { 'Content-Type': contentType },
          }),
      );

      const response = await request(app(fetchFn)).get(
        '/avatars/gazelle/v1/go-developer.png',
      );

      expect(response.status).toBe(200);
    },
  );

  it('logs a failure under a fixed message, the content type as metadata', async () => {
    const logger = mockServices.logger.mock();
    const fetchFn = upstream(
      () =>
        new Response('<svg/>', {
          status: 200,
          headers: { 'Content-Type': 'image/svg+xml' },
        }),
    );

    await request(app(fetchFn, logger)).get(
      '/avatars/gazelle/v1/go-developer.png',
    );

    expect(logger.warn).toHaveBeenCalledWith(
      'The avatar service answered something other than a raster image',
      {
        url: 'https://avatars.gazelle.example/v1/go-developer.png',
        installation: 'gazelle',
        contentType: 'image/svg+xml',
      },
    );
  });

  it('warns, and keeps asking, when a connected avatar service does not answer in time', async () => {
    const logger = mockServices.logger.mock();
    // What the fetch does when the deadline aborts it: the connect timeout is
    // shorter, so the connection was made.
    const fetchFn = upstream(() =>
      Promise.reject(
        new DOMException('This operation was aborted', 'AbortError'),
      ),
    );
    const server = app(fetchFn, logger);

    const response = await request(server).get('/avatars/gazelle/v1/48/a.png');
    await request(server).get('/avatars/gazelle/v1/48/a.png');

    expect(response.status).toBe(502);
    expect(response.body.error.message).toMatch(/no answer within 10 s/);
    expect(logger.warn).toHaveBeenCalledWith(
      'The avatar service did not answer in time',
      expect.objectContaining({ installation: 'gazelle' }),
    );
    expect(logger.info).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('exposes the endpoint size allowlist, the same as the frontend’s', () => {
    expect(AVATAR_SIZES).toEqual([48, 96, 128, 512]);
  });
});

describe('createAvatarFetch', () => {
  const cleanups: Array<() => unknown> = [];

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) {
      await cleanup();
    }
  });

  /** A fetch with a short connect timeout, closed after the test. */
  function avatarFetch(options: Parameters<typeof createAvatarFetch>[0] = {}) {
    const created = createAvatarFetch({ connectTimeoutMs: 100, ...options });
    cleanups.push(created.close);
    return created.fetch;
  }

  async function listen<T extends Server | ReturnType<typeof createTcpServer>>(
    server: T,
  ): Promise<number> {
    cleanups.push(() => server.close());
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    return (server.address() as AddressInfo).port;
  }

  /** A resolver that takes its time and then names the local host. */
  function slowResolver(delayMs: number) {
    return jest.fn((_hostname: string, _options: unknown, callback: any) => {
      setTimeout(
        () => callback(null, [{ address: '127.0.0.1', family: 4 }]),
        delayMs,
      );
    }) as unknown as typeof dnsLookup;
  }

  /** What the router sends along, the deadline included. */
  const routerInit = (signal: AbortSignal): RequestInit => ({
    headers: { Accept: 'image/*' },
    redirect: 'error',
    signal,
  });

  it('fails a host that takes no TLS handshake within the connect timeout as a connect timeout', async () => {
    // Accepts the TCP connection and never says a word: the TLS handshake,
    // part of connecting, does not finish.
    const sockets: Array<{ destroy: () => void }> = [];
    const silent = createTcpServer(socket => sockets.push(socket));
    cleanups.push(() => sockets.forEach(socket => socket.destroy()));
    const port = await listen(silent);

    const error = await avatarFetch()(
      `https://127.0.0.1:${port}/v1/a.png`,
      routerInit(AbortSignal.timeout(5_000)),
    ).catch((e: unknown) => e);

    expect(errorCode(error)).toBe('UND_ERR_CONNECT_TIMEOUT');
  });

  it('starts the connect timeout once the name is resolved: a slow resolver is no connect timeout', async () => {
    const slow = createHttpServer((_req, res) => res.end('resolved late'));
    const port = await listen(slow);
    const lookup = slowResolver(300);

    const response = await avatarFetch({ lookup })(
      `http://avatars.example.test:${port}/v1/a.png`,
      routerInit(AbortSignal.timeout(5_000)),
    );

    expect(await response.text()).toBe('resolved late');
    expect(lookup).toHaveBeenCalledWith(
      'avatars.example.test',
      { all: true },
      expect.any(Function),
    );
  });

  it('keeps the code of a name without an address', async () => {
    const lookup = jest.fn(
      (_hostname: string, _options: unknown, callback: any) =>
        callback(
          Object.assign(new Error('getaddrinfo EAI_AGAIN'), {
            code: 'EAI_AGAIN',
          }),
        ),
    ) as unknown as typeof dnsLookup;

    const error = await avatarFetch({ lookup })(
      'http://avatars.example.test/v1/a.png',
      routerInit(AbortSignal.timeout(5_000)),
    ).catch((e: unknown) => e);

    expect(errorCode(error)).toBe('EAI_AGAIN');
  });

  it('waits past the connect timeout for a host that connected and answers slowly', async () => {
    const slow = createHttpServer((_req, res) => {
      setTimeout(() => res.end('late'), 300);
    });
    const port = await listen(slow);

    const response = await avatarFetch()(
      `http://127.0.0.1:${port}/v1/a.png`,
      routerInit(AbortSignal.timeout(5_000)),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('late');
  });

  it('rejects a connected host that does not answer by the deadline as a timeout, not a connect failure', async () => {
    const silent = createHttpServer(() => undefined);
    const port = await listen(silent);
    cleanups.push(() => silent.closeAllConnections());

    const error = await avatarFetch()(
      `http://127.0.0.1:${port}/v1/a.png`,
      routerInit(AbortSignal.timeout(300)),
    ).catch((e: unknown) => e);

    expect(isProbeTimeout(error)).toBe(true);
    expect(errorCode(error)).not.toBe('UND_ERR_CONNECT_TIMEOUT');
  });

  describe('behind a global dispatcher that is not the plain agent, as an egress proxy is', () => {
    let previous: ReturnType<typeof getGlobalDispatcher>;
    let proxy: MockAgent;

    beforeEach(() => {
      previous = getGlobalDispatcher();
      proxy = new MockAgent();
      proxy.disableNetConnect();
      setGlobalDispatcher(proxy);
    });

    afterEach(async () => {
      setGlobalDispatcher(previous);
      await proxy.close();
    });

    it('goes through it', async () => {
      proxy
        .get('https://avatars.gazelle.example')
        .intercept({ path: '/v1/a.png' })
        .reply(200, 'through the proxy');

      const response = await avatarFetch()(
        'https://avatars.gazelle.example/v1/a.png',
        {},
      );

      expect(await response.text()).toBe('through the proxy');
    });

    it('warns, rather than finding the installation unreachable, when the proxy cannot be connected to', async () => {
      proxy
        .get('https://avatars.gazelle.example')
        .intercept({ path: '/v1/48/a.png' })
        .replyWithError(
          Object.assign(new Error('connect EHOSTUNREACH 10.0.0.2:3128'), {
            code: 'EHOSTUNREACH',
          }),
        );
      const logger = mockServices.logger.mock();
      const fetchFn = jest.fn(avatarFetch());

      const response = await request(app(fetchFn, logger)).get(
        '/avatars/gazelle/v1/48/a.png',
      );

      expect(response.status).toBe(502);
      expect(logger.warn).toHaveBeenCalledWith(
        'The avatar service could not be reached',
        expect.objectContaining({ installation: 'gazelle' }),
      );
      expect(logger.info).not.toHaveBeenCalled();
    });
  });
});

describe('createAvatarRouter', () => {
  it('closes the connections of its own fetch on shutdown', async () => {
    const hooks: Array<() => void | Promise<void>> = [];

    createAvatarRouter({
      config,
      logger: mockServices.logger.mock(),
      lifecycle: { addShutdownHook: hook => hooks.push(hook) },
    });

    expect(hooks).toHaveLength(1);
    await hooks[0]();
  });

  it('leaves a fetch it was given alone', () => {
    const hooks: Array<() => void | Promise<void>> = [];

    createAvatarRouter({
      config,
      logger: mockServices.logger.mock(),
      fetchFn: upstream() as unknown as typeof fetch,
      lifecycle: { addShutdownHook: hook => hooks.push(hook) },
    });

    expect(hooks).toHaveLength(0);
  });
});
