import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { mockServices } from '@backstage/backend-test-utils';
import {
  AuthLoginResult,
  McpContentItem,
  MusterServerGateway,
} from '@giantswarm/backstage-plugin-gs-node';
import express from 'express';
import request from 'supertest';
import {
  bodyArguments,
  createRouter,
  listArguments,
  RouterOptions,
} from './router';

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
      '/repositories?scope=team&team=team-bumblebee&fork=false&archived=false&search=must&renovate=missing&lifecycle=active&inactiveDays=90&finding=default-icon&orb=10&arm64=true&chinaPush=split&signing=signed&limit=50',
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
          archived: false,
          search: 'must',
          renovate: 'missing',
          lifecycle: 'active',
          inactiveDays: 90,
          finding: 'default-icon',
          orb: '10',
          arm64: true,
          chinaPush: 'split',
          signing: 'signed',
          limit: 50,
        },
      },
    ]);
  });

  it('drops the arguments the manager no longer takes', async () => {
    manager.answers.set('list_repositories', { repositories: [] });
    const res = await request(app).get(
      '/repositories?scope=all&minOrphanScore=40&decision=keep&stalePeriodDays=90&undeclared=true',
    );
    expect(res.status).toBe(200);
    expect(manager.calls[0].args).toEqual({ scope: 'all' });
  });

  it('refuses a malformed filter instead of passing it on', async () => {
    expect((await request(app).get('/repositories?fork=maybe')).status).toBe(
      400,
    );
    expect((await request(app).get('/repositories?archived=yes')).status).toBe(
      400,
    );
    expect(
      (await request(app).get('/repositories?inactiveDays=soon')).status,
    ).toBe(400);
    expect((await request(app).get('/repositories?arm64=arm')).status).toBe(
      400,
    );
    expect(manager.calls).toHaveLength(0);
  });

  it('gets one repository record, the query string having no say', async () => {
    const record = { repository: 'giantswarm/muster', findings: [] };
    manager.answers.set('get_repository', record);
    const res = await request(app).get(
      '/repositories/muster?stalePeriodDays=90',
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual(record);
    expect(manager.calls[0]).toEqual({
      tool: 'get_repository',
      authToken: 'dex-id-token',
      args: { repository: 'muster' },
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

  describe('writes as the signed-in person', () => {
    const entry = {
      name: 'new-service',
      componentType: 'service',
      gen: { language: 'go', flavours: ['app'] },
    };

    it('runs the dry run of a declaration through validate_repository, the reason included', async () => {
      const validation = {
        team: 'team-bumblebee',
        entries: [],
        accepted: true,
      };
      manager.answers.set('validate_repository', validation);
      const res = await request(app)
        .post('/repositories/validate')
        .send({ team: 'team-bumblebee', entry, reason: 'the new service' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual(validation);
      expect(manager.calls).toEqual([
        {
          tool: 'validate_repository',
          authToken: 'dex-id-token',
          args: { team: 'team-bumblebee', entry, reason: 'the new service' },
        },
      ]);
    });

    it('creates through create_repository with dryRun and mode handed on as given', async () => {
      const committed = {
        pullRequest: {
          number: 7,
          url: 'https://github.com/giantswarm/github/pull/7',
        },
      };
      manager.answers.set('create_repository', committed);
      const res = await request(app).post('/repositories').send({
        team: 'team-bumblebee',
        entry,
        reason: 'the new service',
        mode: 'commit',
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual(committed);
      expect(manager.calls[0]).toMatchObject({
        tool: 'create_repository',
        args: {
          team: 'team-bumblebee',
          entry,
          reason: 'the new service',
          mode: 'commit',
        },
      });
    });

    it.each([
      ['update', 'update_repository', { entry, reason: 'more flavours' }],
      [
        'adopt',
        'adopt_repository',
        { team: 'team-bumblebee', entry, reason: 'ours to keep' },
      ],
      ['transfer', 'transfer_repository', { toTeam: 'team-planeteers' }],
      ['lifecycle', 'set_lifecycle', { lifecycle: 'archived', reason: 'done' }],
      ['align', 'align_repository', { team: 'team-bumblebee' }],
    ])(
      'POST /repositories/:name/%s calls %s for the repository',
      async (path, tool, body) => {
        const plan = { repository: 'giantswarm/muster', accepted: true };
        manager.answers.set(tool, plan);
        const res = await request(app)
          .post(`/repositories/muster/${path}`)
          .send({ ...body, dryRun: true });
        expect(res.status).toBe(200);
        expect(res.body).toEqual(plan);
        expect(manager.calls[0]).toEqual({
          tool,
          authToken: 'dex-id-token',
          args: { repository: 'muster', ...body, dryRun: true },
        });
      },
    );

    it('follows a new repository through watch_repository with the pull request and the timeout as numbers', async () => {
      const watch = {
        repository: 'https://github.com/giantswarm/muster',
        phases: [
          { name: 'created', at: '2026-09-18T10:00:00Z', seconds: 0 },
          { name: 'scaffolded', at: '2026-09-18T10:00:04Z', seconds: 4 },
        ],
        changed: false,
        ready: false,
        pending: 'declared',
        waited: 20,
      };
      manager.answers.set('watch_repository', watch);
      const res = await request(app)
        .post('/repositories/muster/watch')
        .send({ pullRequest: 4242, timeout: 20 });
      expect(res.status).toBe(200);
      expect(res.body).toEqual(watch);
      expect(manager.calls).toEqual([
        {
          tool: 'watch_repository',
          authToken: 'dex-id-token',
          args: { repository: 'muster', pullRequest: 4242, timeout: 20 },
        },
      ]);
      // The pull request is the tool's number, not a string off a form.
      expect(
        (
          await request(app)
            .post('/repositories/muster/watch')
            .send({ pullRequest: '4242' })
        ).status,
      ).toBe(400);
    });

    it('has no decide route any more', async () => {
      const res = await request(app)
        .post('/repositories/muster/decide')
        .send({ verdict: 'keep' });
      expect(res.status).toBe(404);
      expect(manager.calls).toHaveLength(0);
    });

    it("answers 403 with the manager's reason when it refuses the write", async () => {
      const refusal =
        'mode "apply" is refused: a repository without its declaration is drift the reconciler reports. Use mode "commit" (a team-file pull request opened as you) or dryRun: true for the rendered change';
      manager.failNextCallWith = new Error(refusal);
      const res = await request(app)
        .post('/repositories/muster/lifecycle')
        .send({ lifecycle: 'archived', mode: 'apply' });
      expect(res.status).toBe(403);
      expect(res.body.error.message).toBe(refusal);
      // The mode reached the manager unchanged: the refusal is its, not ours.
      expect(manager.calls[0].args).toMatchObject({ mode: 'apply' });
    });

    it('keeps a broken hop a server fault', async () => {
      // undici reports a connection failure as a TypeError.
      manager.failNextCallWith = new TypeError('fetch failed');
      const res = await request(app)
        .post('/repositories/muster/align')
        .send({ mode: 'commit' });
      expect(res.status).toBe(500);
    });

    it('refuses an argument the tool does not take or of the wrong type', async () => {
      expect(
        (
          await request(app)
            .post('/repositories/muster/transfer')
            .send({ toTeam: 'team-planeteers', force: true })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .post('/repositories')
            .send({ team: 'team-bumblebee', entry: 'not an object' })
        ).status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .post('/repositories/muster/lifecycle')
            .send({ lifecycle: 'archived', dryRun: 'yes' })
        ).status,
      ).toBe(400);
      expect(manager.calls).toHaveLength(0);
    });
  });
});

describe('bodyArguments', () => {
  it('drops null and undefined values and keeps the tool argument names', () => {
    expect(
      bodyArguments(
        { team: 'team-bumblebee', reason: null, entry: { name: 'x' } },
        'create_repository',
      ),
    ).toEqual({ team: 'team-bumblebee', entry: { name: 'x' } });
  });

  it('refuses a body that is not an object', () => {
    expect(() => bodyArguments([], 'validate_repository')).toThrow(
      /JSON object/,
    );
  });
});

describe('listArguments', () => {
  it('drops empty values and keeps the tool argument names', () => {
    expect(
      listArguments({ scope: 'mine', search: '', archived: 'false' }),
    ).toEqual({ scope: 'mine', archived: false });
  });

  it('ignores parameters the tool does not take', () => {
    expect(listArguments({ page: '2', scope: 'all' })).toEqual({
      scope: 'all',
    });
  });
});
