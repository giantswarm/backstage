import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { mockServices } from '@backstage/backend-test-utils';
import {
  AuthLoginResult,
  McpContentItem,
  MusterServerGateway,
  MusterServerNotConnectedError,
} from '@giantswarm/backstage-plugin-gs-node';
import express from 'express';
import request from 'supertest';
import {
  actionsArguments,
  createRouter,
  listArguments,
  RouterOptions,
  writeArguments,
} from './router';

const TOKEN_HEADER = 'backstage-muster-authorization';
const AUTH_URL = 'https://muster/oauth/proxy/start?state=abc';

type Call = { tool: string; args: Record<string, unknown>; authToken: string };

class FakeGateway implements MusterServerGateway {
  readonly server = 'giantswarm-platform-manager';
  calls: Call[] = [];
  answers = new Map<string, unknown>();
  loginResult: AuthLoginResult = {
    status: 'connected',
    message: 'Already Connected',
  };
  failNextCallWith?: Error;

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
    throw new Error('not used by the platform-capabilities router');
  }

  async login() {
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
      '/installations',
    );
    expect(res.status).toBe(503);
    expect(res.body.error.message).toMatch(/platformCapabilities\.muster/);
  });

  it('requires the caller muster token', async () => {
    const res = await request(await buildApp({}, { withToken: false })).get(
      '/installations',
    );
    expect(res.status).toBe(401);
    expect(manager.calls).toHaveLength(0);
  });

  it('reports the connection and the sign-in URL', async () => {
    manager.loginResult = {
      status: 'auth_required',
      message: 'Sign in',
      authUrl: AUTH_URL,
    } as AuthLoginResult;
    const res = await request(app).get('/connection');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      connected: false,
      authUrl: AUTH_URL,
      message: 'Sign in',
    });
  });

  it('lists the installations with the filters as the tool takes them', async () => {
    manager.answers.set('list_installations', { installations: [] });
    const res = await request(app).get(
      '/installations?installations=rowan,%20alder&customer=example',
    );
    expect(res.status).toBe(200);
    expect(manager.calls).toEqual([
      {
        tool: 'list_installations',
        args: { installations: ['rowan', 'alder'], customer: 'example' },
        authToken: 'dex-id-token',
      },
    ]);
  });

  it('renders the dry run of enable with the inputs as given', async () => {
    manager.answers.set('enable_capability', { dryRun: true });
    const res = await request(app)
      .post('/installations/rowan/capabilities/agent-platform/enable')
      .send({ inputs: { kagent: { enabled: true } }, dryRun: true });
    expect(res.status).toBe(200);
    expect(manager.calls[0]).toMatchObject({
      tool: 'enable_capability',
      args: {
        installation: 'rowan',
        capability: 'agent-platform',
        inputs: { kagent: { enabled: true } },
        dryRun: true,
      },
    });
  });

  it('hands the commit mode on to reconcile and refuses an argument the tool does not take', async () => {
    manager.answers.set('reconcile_capability', { action: {} });
    const ok = await request(app)
      .post('/installations/rowan/capabilities/agent-platform/reconcile')
      .send({ mode: 'commit', content: false });
    expect(ok.status).toBe(200);
    expect(manager.calls[0].args).toEqual({
      installation: 'rowan',
      capability: 'agent-platform',
      mode: 'commit',
      content: false,
    });

    const refused = await request(app)
      .post('/installations/rowan/capabilities/agent-platform/enable')
      .send({ installations: ['rowan'] });
    expect(refused.status).toBe(400);
    expect(manager.calls).toHaveLength(1);
  });

  it('verifies, lists and reads actions', async () => {
    manager.answers.set('verify_capability', { features: [] });
    manager.answers.set('list_actions', { actions: [] });
    manager.answers.set('get_action', { name: 'a1' });
    await request(app)
      .post('/installations/rowan/capabilities/agent-platform/verify')
      .expect(200);
    await request(app)
      .post('/installations/rowan/capabilities/agent-platform/verify')
      .send({ inputs: { modelServing: { enabled: true } }, content: false })
      .expect(200);
    await request(app)
      .post('/installations/rowan/capabilities/agent-platform/verify')
      .send({ mode: 'commit' })
      .expect(400);
    await request(app)
      .get('/actions?installation=rowan&capability=agent-platform')
      .expect(200);
    await request(app).get('/actions/a1').expect(200);
    expect(manager.calls.map(c => [c.tool, c.args])).toEqual([
      [
        'verify_capability',
        { installation: 'rowan', capability: 'agent-platform' },
      ],
      [
        'verify_capability',
        {
          installation: 'rowan',
          capability: 'agent-platform',
          inputs: { modelServing: { enabled: true } },
          content: false,
        },
      ],
      ['list_actions', { installation: 'rowan', capability: 'agent-platform' }],
      ['get_action', { name: 'a1' }],
    ]);
  });

  it('answers a missing grant with 401 and the sign-in URL', async () => {
    manager.failNextCallWith = new MusterServerNotConnectedError(
      'Sign in to giantswarm-platform-manager first',
      'giantswarm-platform-manager',
      AUTH_URL,
    );
    const res = await request(app).get('/installations');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({
      name: 'MusterServerNotConnectedError',
      authUrl: AUTH_URL,
    });
  });

  it("shows the manager's refusal as 403 and an unknown installation as 404", async () => {
    manager.failNextCallWith = new Error(
      'mode "commit" is not implemented for enable_capability',
    );
    const refused = await request(app)
      .post('/installations/rowan/capabilities/agent-platform/enable')
      .send({ mode: 'commit' });
    expect(refused.status).toBe(403);
    expect(refused.body.error.message).toMatch(/not implemented/);

    manager.failNextCallWith = new Error('unknown installation "nobody"');
    const missing = await request(app).get(
      '/installations?installations=nobody',
    );
    expect(missing.status).toBe(404);
  });

  it('rejects names the manager does not spell', async () => {
    const res = await request(app)
      .post('/installations/rowan%2F..%2Fx/capabilities/agent-platform/verify')
      .send({});
    expect(res.status).toBe(400);
    expect(manager.calls).toHaveLength(0);
  });

  describe('arguments', () => {
    it('reads the list filters', () => {
      expect(listArguments({})).toEqual({});
      expect(listArguments({ installations: 'a,b', customer: 'c' })).toEqual({
        installations: ['a', 'b'],
        customer: 'c',
      });
      expect(() => listArguments({ installations: ['a', 'b'] })).toThrow(
        /at most once/,
      );
      // The overview's summary is a boolean argument, from `true`/`false`.
      expect(listArguments({ summary: 'true' })).toEqual({ summary: true });
      expect(listArguments({ summary: 'false' })).toEqual({ summary: false });
      expect(() => listArguments({ summary: 'yes' })).toThrow(/true or false/);
    });

    it('reads the action filters', () => {
      expect(actionsArguments({ installation: 'rowan' })).toEqual({
        installation: 'rowan',
      });
      expect(() => actionsArguments({ capability: 'a b' })).toThrow(/not a/);
    });

    it('types the write arguments and drops nulls', () => {
      expect(
        writeArguments({ inputs: {}, content: null, dryRun: true }),
      ).toEqual({
        inputs: {},
        dryRun: true,
      });
      expect(() => writeArguments({ inputs: 'x' })).toThrow(/must be a object/);
      expect(() => writeArguments([])).toThrow(/JSON object/);
    });
  });
});
