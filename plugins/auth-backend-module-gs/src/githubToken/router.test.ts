import { HttpAuthService, LoggerService } from '@backstage/backend-plugin-api';
import { ConfigReader } from '@backstage/config';
import {
  AuthLoginResult,
  MusterServerGateway,
} from '@giantswarm/backstage-plugin-gs-node';
import express from 'express';
import request from 'supertest';
import { SUBJECT_TOKEN_HEADER } from '../clusterToken/router';
import { createGithubTokenRouter } from './router';

const logger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(),
} as unknown as LoggerService;

const httpAuth = {
  credentials: jest.fn().mockResolvedValue({
    principal: { type: 'user', userEntityRef: 'user:default/alice' },
  }),
} as unknown as HttpAuthService;

class FakeGithub implements MusterServerGateway {
  readonly server = 'github';
  loginResult: AuthLoginResult = {
    status: 'auth_required',
    authUrl: 'https://muster.example.com/oauth/proxy/start?state=abc',
    message: 'Authentication required for github.',
  };
  logins: string[] = [];
  logouts: string[] = [];
  async call(): Promise<unknown> {
    throw new Error('not used');
  }
  async callContent(): Promise<never[]> {
    throw new Error('not used');
  }
  async login(authToken: string) {
    this.logins.push(authToken);
    return this.loginResult;
  }
  async logout(authToken: string) {
    this.logouts.push(authToken);
    return 'Successfully logged out; the grant was revoked for all your sessions.';
  }
}

const CONFIG = {
  gs: {
    clusterTokenBroker: {
      tokenUrl: 'https://muster.example.com/oauth/token',
      clientId: 'devportal',
      clientSecret: 'secret',
    },
    github: {
      brokerAudience: 'github',
      muster: { installation: 'gazelle', server: 'github' },
    },
  },
};

function buildApp(github: FakeGithub, configData: object = CONFIG) {
  const router = createGithubTokenRouter({
    config: new ConfigReader(configData),
    logger,
    httpAuth,
    github,
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
      res
        .status(statusByErrorName[err.name] ?? 500)
        .json({ error: err.message });
    },
  );
  return app;
}

function brokerAnswers(...bodies: Array<{ body: object; status?: number }>) {
  const spy = jest.spyOn(global, 'fetch');
  for (const { body, status } of bodies) {
    spy.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status: status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }
  return spy;
}

describe('createGithubTokenRouter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns undefined when gs.github is not configured', () => {
    expect(
      buildApp(new FakeGithub(), {
        gs: { clusterTokenBroker: CONFIG.gs.clusterTokenBroker },
      }),
    ).toBeUndefined();
  });

  it('refuses gs.github without the broker credentials', () => {
    expect(() =>
      buildApp(new FakeGithub(), { gs: { github: CONFIG.gs.github } }),
    ).toThrow(/gs.clusterTokenBroker/);
  });

  it('requires the subject token header', async () => {
    const app = buildApp(new FakeGithub())!;
    const response = await request(app).post('/github-token');
    expect(response.status).toBe(400);
  });

  it('exchanges the Dex ID token for the grant with the broker client and audience, and caches it', async () => {
    const github = new FakeGithub();
    const app = buildApp(github)!;
    const fetchSpy = brokerAnswers({
      body: { access_token: 'ghu_live', expires_in: 27000 },
    });

    const response = await request(app)
      .post('/github-token')
      .set(SUBJECT_TOKEN_HEADER, 'dex-id-token');

    expect(response.status).toBe(200);
    expect(response.body.token).toBe('ghu_live');
    expect(response.body.expiresInSeconds).toBe(27000);
    expect(response.headers['cache-control']).toBe('no-store');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://muster.example.com/oauth/token');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('devportal:secret').toString('base64')}`,
    );
    const params = new URLSearchParams(init.body as string);
    expect(params.get('grant_type')).toBe(
      'urn:ietf:params:oauth:grant-type:token-exchange',
    );
    expect(params.get('subject_token')).toBe('dex-id-token');
    expect(params.get('subject_token_type')).toBe(
      'urn:ietf:params:oauth:token-type:id_token',
    );
    expect(params.get('audience')).toBe('github');
    expect(github.logins).toEqual([]);

    // Second call within the skew is served from the cache.
    const cached = await request(app)
      .post('/github-token')
      .set(SUBJECT_TOKEN_HEADER, 'dex-id-token');
    expect(cached.status).toBe(200);
    expect(cached.body.token).toBe('ghu_live');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("answers 401 no_grant with muster's connect URL when the person holds no grant", async () => {
    const github = new FakeGithub();
    const app = buildApp(github)!;
    brokerAnswers({
      body: {
        error: 'invalid_target',
        error_description: 'the requested audience cannot be served',
      },
      status: 400,
    });

    const response = await request(app)
      .post('/github-token')
      .set(SUBJECT_TOKEN_HEADER, 'dex-id-token');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "Connect GitHub in muster (server 'github') to use this page.",
      reason: 'no_grant',
      server: 'github',
      authUrl: 'https://muster.example.com/oauth/proxy/start?state=abc',
    });
    expect(github.logins).toEqual(['dex-id-token']);
  });

  it('retries the exchange once when muster connects the server on login', async () => {
    const github = new FakeGithub();
    github.loginResult = {
      status: 'connected',
      message: 'Successfully connected',
    };
    const app = buildApp(github)!;
    const fetchSpy = brokerAnswers(
      { body: { error: 'invalid_target' }, status: 400 },
      { body: { access_token: 'ghu_live', expires_in: 100 } },
    );

    const response = await request(app)
      .post('/github-token')
      .set(SUBJECT_TOKEN_HEADER, 'dex-id-token');

    expect(response.status).toBe(200);
    expect(response.body.token).toBe('ghu_live');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(github.logins).toHaveLength(1);
  });

  it('reports a misconfigured grant target when the broker still refuses after muster connected', async () => {
    const github = new FakeGithub();
    github.loginResult = {
      status: 'connected',
      message: 'Successfully connected',
    };
    const app = buildApp(github)!;
    brokerAnswers(
      { body: { error: 'invalid_target' }, status: 400 },
      { body: { error: 'invalid_target' }, status: 400 },
    );

    const response = await request(app)
      .post('/github-token')
      .set(SUBJECT_TOKEN_HEADER, 'dex-id-token');

    expect(response.status).toBe(502);
    expect(response.body.reason).toBe('exchange_failed');
  });

  it('maps invalid_client to a broker fault, not to the person', async () => {
    const app = buildApp(new FakeGithub())!;
    brokerAnswers({ body: { error: 'invalid_client' }, status: 401 });

    const response = await request(app)
      .post('/github-token')
      .set(SUBJECT_TOKEN_HEADER, 'dex-id-token');

    expect(response.status).toBe(502);
    expect(response.body.reason).toBe('broker_client_invalid');
  });

  it('maps a rejected subject token to subject_invalid', async () => {
    const app = buildApp(new FakeGithub())!;
    brokerAnswers({ body: { error: 'invalid_grant' }, status: 400 });

    const response = await request(app)
      .post('/github-token')
      .set(SUBJECT_TOKEN_HEADER, 'dex-id-token');

    expect(response.status).toBe(502);
    expect(response.body.reason).toBe('subject_invalid');
  });

  it('answers 502 broker_unreachable when the broker cannot be reached', async () => {
    const app = buildApp(new FakeGithub())!;
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new TypeError('fetch failed'));

    const response = await request(app)
      .post('/github-token')
      .set(SUBJECT_TOKEN_HEADER, 'dex-id-token');

    expect(response.status).toBe(502);
    expect(response.body.reason).toBe('broker_unreachable');
  });

  it('signs the person out in muster and drops the cached token', async () => {
    const github = new FakeGithub();
    const app = buildApp(github)!;
    const fetchSpy = brokerAnswers(
      { body: { access_token: 'ghu_live', expires_in: 27000 } },
      { body: { error: 'invalid_target' }, status: 400 },
    );
    await request(app)
      .post('/github-token')
      .set(SUBJECT_TOKEN_HEADER, 'dex-id-token');

    const logout = await request(app)
      .post('/github-token/logout')
      .set(SUBJECT_TOKEN_HEADER, 'dex-id-token');
    expect(logout.status).toBe(200);
    expect(logout.body.signedOut).toBe(true);
    expect(github.logouts).toEqual(['dex-id-token']);

    // The cache is gone: the next mint goes to the broker again (and finds no grant).
    const after = await request(app)
      .post('/github-token')
      .set(SUBJECT_TOKEN_HEADER, 'dex-id-token');
    expect(after.status).toBe(401);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
