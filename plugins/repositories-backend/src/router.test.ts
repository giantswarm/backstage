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

  describe('grant server', () => {
    const NO_GRANT =
      'no GitHub grant for you yet: connect GitHub in muster (core_auth_login on the GitHub server)';
    const GRANT_URL =
      'https://muster.example/oauth/proxy/start?state=grant&redirect=%2Frepositories';

    function grantGateway(gateway: MusterServerGateway) {
      (gateway.callTool as jest.Mock).mockResolvedValue(toolError(NO_GRANT));
      (gateway.login as jest.Mock).mockImplementation(
        async (server: string) => ({
          authUrl:
            server === 'github-repository-setup'
              ? GRANT_URL
              : 'https://muster.example/oauth/proxy/start?state=manager',
          server,
        }),
      );
    }

    it('passes the manager answer through unchanged when grantServer is unset', async () => {
      const { app, gateway } = await makeApp();
      grantGateway(gateway);
      const res = await request(app).get('/api/repositories/repositories');
      expect(res.status).toBe(403);
      expect(res.body.authUrl).toBeUndefined();
      expect(gateway.login).not.toHaveBeenCalled();
    });

    it('answers 401 with the grant server authUrl when the grant is missing', async () => {
      const { app, gateway } = await makeApp({
        muster: { grantServer: 'github-repository-setup' },
      });
      grantGateway(gateway);
      const res = await request(app).get('/api/repositories/repositories');
      expect(res.status).toBe(401);
      expect(res.body.authUrl).toBe(GRANT_URL);
      expect(res.body.server).toBe('github-repository-setup');
      expect(gateway.login).toHaveBeenCalledWith(
        'github-repository-setup',
        expect.anything(),
      );
    });

    it('passes through when the grant is present', async () => {
      const { app, gateway } = await makeApp({
        muster: { grantServer: 'github-repository-setup' },
      });
      (gateway.callTool as jest.Mock).mockResolvedValue(
        text({ repositories: [{ name: 'x' }] }),
      );
      const res = await request(app).get('/api/repositories/repositories');
      expect(res.status).toBe(200);
      expect(gateway.login).not.toHaveBeenCalled();
    });

    it('leaves other tool errors alone even with grantServer set', async () => {
      const { app, gateway } = await makeApp({
        muster: { grantServer: 'github-repository-setup' },
      });
      (gateway.callTool as jest.Mock).mockResolvedValue(
        toolError('repository not found'),
      );
      const res = await request(app).get('/api/repositories/repositories/x');
      expect(res.status).toBe(403);
      expect(gateway.login).not.toHaveBeenCalled();
    });

    it('reports the grant server on /connection', async () => {
      const { app, gateway } = await makeApp({
        muster: { grantServer: 'github-repository-setup' },
      });
      (gateway.status as jest.Mock).mockImplementation(
        async (server: string) => ({
          connected: server !== 'github-repository-setup',
        }),
      );
      (gateway.login as jest.Mock).mockResolvedValue({
        authUrl: GRANT_URL,
        server: 'github-repository-setup',
      });
      const res = await request(app).get('/api/repositories/connection');
      expect(res.status).toBe(200);
      expect(res.body.connected).toBe(true);
      expect(res.body.grant).toEqual({
        server: 'github-repository-setup',
        connected: false,
        authUrl: GRANT_URL,
      });
    });

    it('reports only the manager on /connection when grantServer is unset', async () => {
      const { app } = await makeApp();
      const res = await request(app).get('/api/repositories/connection');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ connected: true });
      expect(res.body.grant).toBeUndefined();
    });
  });
});
