import { HttpAuthService, LoggerService } from '@backstage/backend-plugin-api';
import { ConfigReader } from '@backstage/config';
import express from 'express';
import request from 'supertest';
import { createClusterTokenRouter, SUBJECT_TOKEN_HEADER } from './router';

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

const BROKER_CONFIG = {
  gs: {
    clusterTokenBroker: {
      tokenUrl: 'https://muster.example.com/oauth/token',
      clientId: 'backstage',
      clientSecret: 'secret',
    },
    installations: {
      golem: {},
      gaggle: {
        clusterTokenAudience: 'gaggle-mc',
      },
    },
  },
};

function buildApp(configData: object = BROKER_CONFIG) {
  const router = createClusterTokenRouter({
    config: new ConfigReader(configData),
    logger,
    httpAuth,
  });
  if (!router) {
    return undefined;
  }
  const app = express();
  app.use(router);
  // Minimal error handler mirroring Backstage's middleware status mapping.
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

function mockBrokerResponse(
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

describe('createClusterTokenRouter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns undefined when no broker is configured', () => {
    expect(buildApp({ gs: {} })).toBeUndefined();
  });

  it('returns 404 for an unknown installation', async () => {
    const res = await request(buildApp()!)
      .post('/cluster-token/unknown')
      .set(SUBJECT_TOKEN_HEADER, 'subject-token');
    expect(res.status).toBe(404);
  });

  it('returns 400 when the subject token header is missing', async () => {
    const res = await request(buildApp()!).post('/cluster-token/golem');
    expect(res.status).toBe(400);
  });

  it('exchanges the subject token at the broker and returns the cluster token', async () => {
    const fetchSpy = mockBrokerResponse({
      access_token: 'mc-token',
      token_type: 'Bearer',
      expires_in: 1800,
    });

    const res = await request(buildApp()!)
      .post('/cluster-token/golem')
      .set(SUBJECT_TOKEN_HEADER, 'subject-token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ token: 'mc-token', expiresInSeconds: 1800 });
    expect(res.headers['cache-control']).toBe('no-store');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://muster.example.com/oauth/token');
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from('backstage:secret').toString('base64')}`,
    );
    const params = new URLSearchParams(init.body);
    expect(params.get('grant_type')).toBe(
      'urn:ietf:params:oauth:grant-type:token-exchange',
    );
    expect(params.get('subject_token')).toBe('subject-token');
    expect(params.get('subject_token_type')).toBe(
      'urn:ietf:params:oauth:token-type:id_token',
    );
    expect(params.get('audience')).toBe('golem');
    expect(params.get('scope')).toBeNull();
  });

  it('uses the configured audience override and scope', async () => {
    const fetchSpy = mockBrokerResponse({
      access_token: 'mc-token',
      expires_in: 1800,
    });

    const configWithScope = JSON.parse(JSON.stringify(BROKER_CONFIG));
    configWithScope.gs.clusterTokenBroker.scope =
      'openid audience:server:client_id:dex-k8s-authenticator';

    const res = await request(buildApp(configWithScope)!)
      .post('/cluster-token/gaggle')
      .set(SUBJECT_TOKEN_HEADER, 'subject-token');

    expect(res.status).toBe(200);
    const params = new URLSearchParams(fetchSpy.mock.calls[0][1].body);
    expect(params.get('audience')).toBe('gaggle-mc');
    expect(params.get('scope')).toBe(
      'openid audience:server:client_id:dex-k8s-authenticator',
    );
  });

  it('serves cached tokens until close to expiry', async () => {
    const fetchSpy = mockBrokerResponse({
      access_token: 'mc-token',
      expires_in: 1800,
    });
    const app = buildApp()!;

    const first = await request(app)
      .post('/cluster-token/golem')
      .set(SUBJECT_TOKEN_HEADER, 'subject-token');
    const second = await request(app)
      .post('/cluster-token/golem')
      .set(SUBJECT_TOKEN_HEADER, 'subject-token');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.token).toBe('mc-token');
    expect(second.body.expiresInSeconds).toBeLessThanOrEqual(1800);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('re-exchanges when the cached token is close to expiry', async () => {
    const fetchSpy = mockBrokerResponse({
      access_token: 'short-lived',
      expires_in: 60,
    });
    const app = buildApp()!;

    await request(app)
      .post('/cluster-token/golem')
      .set(SUBJECT_TOKEN_HEADER, 'subject-token');
    await request(app)
      .post('/cluster-token/golem')
      .set(SUBJECT_TOKEN_HEADER, 'subject-token');

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('maps broker errors to 502 without leaking details', async () => {
    mockBrokerResponse(
      { error: 'invalid_target', error_description: 'unknown audience' },
      { status: 400 },
    );

    const res = await request(buildApp()!)
      .post('/cluster-token/golem')
      .set(SUBJECT_TOKEN_HEADER, 'subject-token');

    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      error: 'Token exchange failed',
      reason: 'exchange_failed',
    });
  });

  it('maps a rejected subject token to a subject_invalid reason', async () => {
    mockBrokerResponse(
      { error: 'invalid_grant', error_description: 'subject token expired' },
      { status: 400 },
    );

    const res = await request(buildApp()!)
      .post('/cluster-token/golem')
      .set(SUBJECT_TOKEN_HEADER, 'subject-token');

    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      error: 'Token exchange failed',
      reason: 'subject_invalid',
    });
  });

  it('maps an unreachable broker to 502', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const res = await request(buildApp()!)
      .post('/cluster-token/golem')
      .set(SUBJECT_TOKEN_HEADER, 'subject-token');

    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      error: 'Token broker is unreachable',
      reason: 'broker_unreachable',
    });
  });
});
