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

const DEX_TARGET = {
  tokenUrl: 'https://dex.gaggle.example.com/token',
  clientId: 'portal-broker',
  clientSecret: 'dex-secret',
  connectorId: 'portal',
  scopes: 'openid email groups audience:server:client_id:dex-k8s-authenticator',
};

// A portal without muster: only gaggle is reachable, through its own Dex.
const DEX_ONLY_CONFIG = {
  gs: {
    clusterTokenBroker: { targets: { gaggle: DEX_TARGET } },
    installations: BROKER_CONFIG.gs.installations,
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
  beforeEach(() => {
    // Clear accumulated call records (but keep mock implementations) so each
    // test can assert on logger calls in isolation.
    jest.clearAllMocks();
  });

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
    // A broker-side exchange failure is actionable and must reach Sentry.
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a token store outage',
      JSON.stringify({
        error: 'temporarily_unavailable',
        error_description: 'The server could not reach its token store',
      }),
    ],
    [
      'pending OIDC discovery',
      JSON.stringify({
        error: 'service_unavailable',
        error_description: 'OIDC discovery in progress, please retry',
      }),
    ],
    ['an empty body', ''],
  ])(
    'maps a 503 for %s to a broker_unavailable reason',
    async (_case, body) => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response(body, { status: 503 }));

      const res = await request(buildApp()!)
        .post('/cluster-token/golem')
        .set(SUBJECT_TOKEN_HEADER, 'subject-token');

      expect(res.status).toBe(502);
      expect(res.body).toEqual({
        error: 'Token broker is temporarily unavailable',
        reason: 'broker_unavailable',
      });
      // One constant message per broker outage, the installation in metadata.
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        'Cluster token exchange failed: token broker temporarily unavailable',
        expect.objectContaining({ installation: 'golem', status: 503 }),
      );
    },
  );

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
    // A rejected subject token is a routine, already-handled outcome; it must
    // NOT reach Sentry (which the winston bridge forwards at `warn`).
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledTimes(1);
  });

  it('maps a broker client-auth failure to a broker_client_invalid reason', async () => {
    mockBrokerResponse(
      {
        error: 'invalid_client',
        error_description: 'client authentication failed',
      },
      { status: 401 },
    );

    const res = await request(buildApp()!)
      .post('/cluster-token/golem')
      .set(SUBJECT_TOKEN_HEADER, 'subject-token');

    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      error: 'Token exchange failed',
      reason: 'broker_client_invalid',
    });
    // A broker self-auth failure is a genuine outage: keep it at `warn`, but
    // keep the installation out of the message (and in metadata) so a single
    // outage collapses into one Sentry issue instead of one per installation.
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.not.stringContaining('golem'),
      expect.objectContaining({ installation: 'golem' }),
    );
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('still maps a non-invalid_client 401 to subject_invalid', async () => {
    mockBrokerResponse(
      { error: 'invalid_token', error_description: 'subject token rejected' },
      { status: 401 },
    );

    const res = await request(buildApp()!)
      .post('/cluster-token/golem')
      .set(SUBJECT_TOKEN_HEADER, 'subject-token');

    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      error: 'Token exchange failed',
      reason: 'subject_invalid',
    });
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledTimes(1);
  });

  it('maps an unreachable broker to 502', async () => {
    // Mirror an undici fetch rejection: the actionable code lives on
    // `error.cause`, not the top-level "TypeError: fetch failed" message.
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(
        new TypeError('fetch failed', { cause: new Error('ECONNREFUSED') }),
      );

    const res = await request(buildApp()!)
      .post('/cluster-token/golem')
      .set(SUBJECT_TOKEN_HEADER, 'subject-token');

    expect(res.status).toBe(502);
    expect(res.body).toEqual({
      error: 'Token broker is unreachable',
      reason: 'broker_unreachable',
    });
    // A genuine broker outage must reach Sentry with the underlying cause
    // preserved, not just the opaque "fetch failed" wrapper.
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.not.stringContaining('golem'),
      expect.objectContaining({
        installation: 'golem',
        cause: expect.stringContaining('ECONNREFUSED'),
      }),
    );
  });
  describe('with a Dex target', () => {
    it('exchanges at the installation\'s Dex for an id_token', async () => {
      const fetchSpy = mockBrokerResponse({
        access_token: 'dex-id-token',
        issued_token_type: 'urn:ietf:params:oauth:token-type:id_token',
        token_type: 'bearer',
        expires_in: 3600,
      });

      const res = await request(buildApp(DEX_ONLY_CONFIG)!)
        .post('/cluster-token/gaggle')
        .set(SUBJECT_TOKEN_HEADER, 'subject-token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        token: 'dex-id-token',
        expiresInSeconds: 3600,
      });
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://dex.gaggle.example.com/token');
      expect(init.headers.Authorization).toBe(
        `Basic ${Buffer.from('portal-broker:dex-secret').toString('base64')}`,
      );
      const params = new URLSearchParams(init.body);
      expect(params.get('grant_type')).toBe(
        'urn:ietf:params:oauth:grant-type:token-exchange',
      );
      expect(params.get('subject_token')).toBe('subject-token');
      expect(params.get('connector_id')).toBe('portal');
      expect(params.get('scope')).toBe(DEX_TARGET.scopes);
      expect(params.get('requested_token_type')).toBe(
        'urn:ietf:params:oauth:token-type:id_token',
      );
      expect(params.get('audience')).toBeNull();
    });

    it('returns 404 for an installation without a target and no muster', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');
      const res = await request(buildApp(DEX_ONLY_CONFIG)!)
        .post('/cluster-token/golem')
        .set(SUBJECT_TOKEN_HEADER, 'subject-token');
      expect(res.status).toBe(404);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('prefers the target over muster for its installation', async () => {
      const fetchSpy = mockBrokerResponse({
        access_token: 'token',
        expires_in: 1800,
      });
      const config = JSON.parse(JSON.stringify(BROKER_CONFIG));
      config.gs.clusterTokenBroker.targets = { gaggle: DEX_TARGET };
      const app = buildApp(config)!;

      await request(app)
        .post('/cluster-token/gaggle')
        .set(SUBJECT_TOKEN_HEADER, 'subject-token');
      await request(app)
        .post('/cluster-token/golem')
        .set(SUBJECT_TOKEN_HEADER, 'subject-token');

      expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
        'https://dex.gaggle.example.com/token',
        'https://muster.example.com/oauth/token',
      ]);
    });

    it('maps a wrong target client secret to broker_client_invalid', async () => {
      mockBrokerResponse({ error: 'invalid_client' }, { status: 401 });
      const res = await request(buildApp(DEX_ONLY_CONFIG)!)
        .post('/cluster-token/gaggle')
        .set(SUBJECT_TOKEN_HEADER, 'subject-token');
      expect(res.status).toBe(502);
      expect(res.body.reason).toBe('broker_client_invalid');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.not.stringContaining('gaggle'),
        expect.objectContaining({ installation: 'gaggle', broker: 'dex' }),
      );
    });

    it('refuses a target without its required fields at startup', () => {
      const { scopes: _scopes, ...incomplete } = DEX_TARGET;
      expect(() =>
        buildApp({
          gs: { clusterTokenBroker: { targets: { gaggle: incomplete } } },
        }),
      ).toThrow(/scopes/);
    });

    it('refuses a broker with neither a tokenUrl nor targets', () => {
      expect(() =>
        buildApp({ gs: { clusterTokenBroker: { scope: 'openid' } } }),
      ).toThrow(/tokenUrl.*targets/);
    });
  });
});
