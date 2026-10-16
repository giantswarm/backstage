import { ConfigReader } from '@backstage/config';
import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { mockServices } from '@backstage/backend-test-utils';
import express from 'express';
import request from 'supertest';
import { AVATAR_SIZES, createAvatarRouter } from './avatarRouter';

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

function app(
  fetchFn: jest.Mock,
  logger: ReturnType<
    typeof mockServices.logger.mock
  > = mockServices.logger.mock(),
  now: () => number = Date.now,
) {
  const router = createAvatarRouter({
    config,
    logger,
    fetchFn: fetchFn as unknown as typeof fetch,
    now,
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

  it.each([
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
        ] as const,
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

  it('exposes the endpoint size allowlist, the same as the frontend’s', () => {
    expect(AVATAR_SIZES).toEqual([48, 96, 128, 512]);
  });
});
