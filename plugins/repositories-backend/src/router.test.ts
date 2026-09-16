import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { mockServices } from '@backstage/backend-test-utils';
import {
  AuthLoginResult,
  McpContentItem,
  MusterServerGateway,
} from '@giantswarm/backstage-plugin-gs-node';
import express from 'express';
import request from 'supertest';
import { createRouter, listArguments, RouterOptions } from './router';

const TOKEN_HEADER = 'backstage-muster-authorization';

type Call = { tool: string; args: Record<string, unknown>; authToken: string };

/**
 * giantswarm-repo-manager-through-muster stand-in: answers keyed by tool
 * name, every call recorded, `loginResult` the way muster answers a session
 * with or without a grant.
 */
class FakeGateway implements MusterServerGateway {
  readonly server = 'giantswarm-repo-manager';
  calls: Call[] = [];
  answers = new Map<string, unknown>();
  loginResult: AuthLoginResult = {
    status: 'connected',
    message: 'Already Connected',
  };
  failNextCallWith?: Error;
  logins = 0;

  async call(tool: string, args: Record<string, unknown>, authToken: string) {
    this.calls.push({ tool, args, authToken });
    if (this.failNextCallWith) {
      const error = this.failNextCallWith;
      this.failNextCallWith = undefined;
      throw error;
    }
    if (!this.answers.has(tool)) {
      throw new Error(`FakeGateway: no answer for ${tool}`);
    }
    return this.answers.get(tool);
  }

  async callContent(): Promise<McpContentItem[]> {
    throw new Error('not used by the repositories router');
  }

  async login() {
    this.logins++;
    return this.loginResult;
  }

  async logout() {
    return 'Successfully logged out';
  }
}

describe('createRouter', () => {
  let manager: FakeGateway;
  let app: express.Express;

  async function buildApp(
    options: Partial<RouterOptions> = {},
    { withToken = true }: { withToken?: boolean } = {},
  ) {
    const logger = mockServices.logger.mock();
    const router = await createRouter({
      logger,
      httpAuth: mockServices.httpAuth(),
      manager,
      ...options,
    });
    const built = express();
    if (withToken) {
      built.use((req, _res, next) => {
        req.headers[TOKEN_HEADER] = 'dex-id-token';
        next();
      });
    }
    built.use(router);
    built.use(
      MiddlewareFactory.create({
        logger,
        config: mockServices.rootConfig(),
      }).error(),
    );
    return built;
  }

  beforeEach(async () => {
    manager = new FakeGateway();
    app = await buildApp();
  });

  it('returns 503 when the manager is not configured', async () => {
    const res = await request(await buildApp({ manager: undefined })).get(
      '/repositories',
    );
    expect(res.status).toBe(503);
    expect(res.body.error.message).toMatch(/repositories\.muster/);
  });

  it('requires the caller muster token', async () => {
    const res = await request(await buildApp({}, { withToken: false })).get(
      '/repositories',
    );
    expect(res.status).toBe(401);
    expect(manager.calls).toHaveLength(0);
  });

  it('reports the connection with the sign-in URL when there is no grant', async () => {
    manager.loginResult = {
      status: 'auth_required',
      message: 'Sign in',
      authUrl: 'https://muster/oauth/proxy/start?state=abc',
    };
    const res = await request(app).get('/connection');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      connected: false,
      authUrl: 'https://muster/oauth/proxy/start?state=abc',
      message: 'Sign in',
    });
  });

  it('answers 401 with the sign-in URL when the first call finds no grant', async () => {
    manager.loginResult = {
      status: 'auth_required',
      message: 'Sign in',
      authUrl: 'https://muster/oauth/proxy/start?state=abc',
    };
    manager.failNextCallWith = new Error('not authenticated: sign in first');
    const res = await request(app).get('/repositories');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({
      name: 'MusterServerNotConnectedError',
      server: 'giantswarm-repo-manager',
      authUrl: 'https://muster/oauth/proxy/start?state=abc',
    });
  });

  it('lists repositories with the query passed on as typed tool arguments', async () => {
    const listing = {
      sweep: null,
      sweepRunning: false,
      total: 2,
      matched: 1,
      shown: 1,
      repositories: [{ repository: 'giantswarm/muster', age: '5m' }],
    };
    manager.answers.set('list_repositories', listing);
    const res = await request(app).get(
      '/repositories?scope=team&team=team-bumblebee&fork=false&minOrphanScore=40&search=must&renovate=missing&limit=50',
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual(listing);
    expect(manager.calls).toEqual([
      {
        tool: 'list_repositories',
        authToken: 'dex-id-token',
        args: {
          scope: 'team',
          team: 'team-bumblebee',
          fork: false,
          minOrphanScore: 40,
          search: 'must',
          renovate: 'missing',
          limit: 50,
        },
      },
    ]);
  });

  it('refuses a malformed filter instead of passing it on', async () => {
    expect((await request(app).get('/repositories?fork=maybe')).status).toBe(
      400,
    );
    expect(
      (await request(app).get('/repositories?inactiveDays=soon')).status,
    ).toBe(400);
    expect(manager.calls).toHaveLength(0);
  });

  it('gets one repository record, rescored for a stale period on request', async () => {
    const record = { repository: 'giantswarm/muster', orphan: { score: 0 } };
    manager.answers.set('get_repository', record);
    const res = await request(app).get(
      '/repositories/muster?stalePeriodDays=90',
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual(record);
    expect(manager.calls[0]).toMatchObject({
      tool: 'get_repository',
      args: { repository: 'muster', stalePeriodDays: 90 },
    });
  });

  it('answers 404 when the manager knows no such repository', async () => {
    manager.failNextCallWith = new Error(
      'giantswarm/nope: no record (neither declared nor on GitHub)',
    );
    const res = await request(app).get('/repositories/nope');
    expect(res.status).toBe(404);
  });

  it('refreshes a record through refresh_repository', async () => {
    const record = { repository: 'giantswarm/muster', source: 'refresh' };
    manager.answers.set('refresh_repository', record);
    const res = await request(app).post('/repositories/muster/refresh');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(record);
    expect(manager.calls[0]).toMatchObject({
      tool: 'refresh_repository',
      args: { repository: 'muster' },
    });
  });

  it('reports the identity chain from get_info', async () => {
    const info = { version: 'v0.3.0', github: { grant: { obtained: true } } };
    manager.answers.set('get_info', info);
    const res = await request(app).get('/info');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(info);
  });
});

describe('listArguments', () => {
  it('drops empty values and keeps the tool argument names', () => {
    expect(
      listArguments({ scope: 'mine', search: '', undeclared: 'true' }),
    ).toEqual({ scope: 'mine', undeclared: true });
  });

  it('ignores parameters the tool does not take', () => {
    expect(listArguments({ page: '2', scope: 'all' })).toEqual({
      scope: 'all',
    });
  });
});
