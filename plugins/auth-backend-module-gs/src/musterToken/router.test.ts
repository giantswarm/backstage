import { HttpAuthService, LoggerService } from '@backstage/backend-plugin-api';
import { ConfigReader } from '@backstage/config';
import express from 'express';
import request from 'supertest';
import { createMusterTokenRouter, SUBJECT_TOKEN_HEADER } from './router';

const logger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(),
} as unknown as LoggerService;

const httpAuth = {
  credentials: jest.fn().mockResolvedValue({
    principal: { type: 'user', userEntityRef: 'user:default/mock' },
  }),
} as unknown as HttpAuthService;

const MUSTER_CONFIG = {
  gs: {
    musterToken: {
      tokenUrl: 'https://muster.example.com/oauth/token',
    },
  },
};

function buildApp(configData: object = MUSTER_CONFIG) {
  const router = createMusterTokenRouter({
    config: new ConfigReader(configData),
    logger,
    httpAuth,
  });
  if (!router) {
    return undefined;
  }
  const app = express();
  app.use(router);
  app.use(
    (
      err: Error & { name: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const statusByErrorName: Record<string, number> = {
        NotFoundError: 404,
        InputError: 400,
      };
      const status = statusByErrorName[err.name] ?? 500;
      res.status(status).json({ error: err.message });
    },
  );
  return app;
}

function mockMusterResponse(
  body: object,
  init: { status?: number } = {},
): jest.SpyInstance {
  return jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('createMusterTokenRouter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns undefined when muster token endpoint is not configured', () => {
    expect(buildApp({ gs: {} })).toBeUndefined();
  });

  it('returns 400 when the subject token header is missing', async () => {
    const res = await request(buildApp()!).post('/muster-token');
    expect(res.status).toBe(400);
  });

  it('exchanges the subject token with no audience and no client auth', async () => {
    const fetchSpy = mockMusterResponse({
      access_token: 'muster-token',
      token_type: 'Bearer',
      expires_in: 1800,
    });

    const res = await request(buildApp()!)
      .post('/muster-token')
      .set(SUBJECT_TOKEN_HEADER, 'subject-token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ token: 'muster-token', expiresInSeconds: 1800 });
    expect(res.headers['cache-control']).toBe('no-store');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://muster.example.com/oauth/token');
    // The self-issued path is unauthenticated: no client credentials.
    expect(init.headers.Authorization).toBeUndefined();
    const params = new URLSearchParams(init.body);
    expect(params.get('grant_type')).toBe(
      'urn:ietf:params:oauth:grant-type:token-exchange',
    );
    expect(params.get('subject_token')).toBe('subject-token');
    expect(params.get('subject_token_type')).toBe(
      'urn:ietf:params:oauth:token-type:id_token',
    );
    // An audience would route muster to the brokered path.
    expect(params.get('audience')).toBeNull();
    expect(params.get('scope')).toBeNull();
  });

  it('sends the configured scope', async () => {
    const fetchSpy = mockMusterResponse({
      access_token: 'muster-token',
      expires_in: 1800,
    });

    const configWithScope = JSON.parse(JSON.stringify(MUSTER_CONFIG));
    configWithScope.gs.musterToken.scope = 'openid profile';

    const res = await request(buildApp(configWithScope)!)
      .post('/muster-token')
      .set(SUBJECT_TOKEN_HEADER, 'subject-token');

    expect(res.status).toBe(200);
    const params = new URLSearchParams(fetchSpy.mock.calls[0][1].body);
    expect(params.get('scope')).toBe('openid profile');
  });

  it('serves cached tokens until close to expiry', async () => {
    const fetchSpy = mockMusterResponse({
      access_token: 'muster-token',
      expires_in: 1800,
    });
    const app = buildApp()!;

    const first = await request(app)
      .post('/muster-token')
      .set(SUBJECT_TOKEN_HEADER, 'subject-token');
    const second = await request(app)
      .post('/muster-token')
      .set(SUBJECT_TOKEN_HEADER, 'subject-token');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.token).toBe('muster-token');
    expect(second.body.expiresInSeconds).toBeLessThanOrEqual(1800);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('re-exchanges when the cached token is close to expiry', async () => {
    const fetchSpy = mockMusterResponse({
      access_token: 'short-lived',
      expires_in: 60,
    });
    const app = buildApp()!;

    await request(app)
      .post('/muster-token')
      .set(SUBJECT_TOKEN_HEADER, 'subject-token');
    await request(app)
      .post('/muster-token')
      .set(SUBJECT_TOKEN_HEADER, 'subject-token');

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('maps a rejected subject token to a subject_invalid reason at debug', async () => {
    mockMusterResponse(
      { error: 'invalid_grant', error_description: 'subject token expired' },
      { status: 400 },
    );

    const res = await request(buildApp()!)
      .post('/muster-token')
      .set(SUBJECT_TOKEN_HEADER, 'subject-token');

    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      error: 'Token exchange failed',
      reason: 'subject_invalid',
    });
    // Routine, already-handled outcome; must NOT reach Sentry.
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledTimes(1);
  });

  it('maps a bare 401 to subject_invalid', async () => {
    mockMusterResponse({ error_description: 'unauthorized' }, { status: 401 });

    const res = await request(buildApp()!)
      .post('/muster-token')
      .set(SUBJECT_TOKEN_HEADER, 'subject-token');

    expect(res.status).toBe(502);
    expect(res.body.reason).toBe('subject_invalid');
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledTimes(1);
  });

  it('maps a muster-side exchange failure to exchange_failed at warn', async () => {
    mockMusterResponse(
      { error: 'server_error', error_description: 'unexpected' },
      { status: 500 },
    );

    const res = await request(buildApp()!)
      .post('/muster-token')
      .set(SUBJECT_TOKEN_HEADER, 'subject-token');

    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      error: 'Token exchange failed',
      reason: 'exchange_failed',
    });
    // A non-subject failure is an actionable muster-side fault -> warn.
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('maps an unreachable muster to 502 with the underlying cause', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(
        new TypeError('fetch failed', { cause: new Error('ECONNREFUSED') }),
      );

    const res = await request(buildApp()!)
      .post('/muster-token')
      .set(SUBJECT_TOKEN_HEADER, 'subject-token');

    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      error: 'Muster is unreachable',
      reason: 'broker_unreachable',
    });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        cause: expect.stringContaining('ECONNREFUSED'),
      }),
    );
  });
});
