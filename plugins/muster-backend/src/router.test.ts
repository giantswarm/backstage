import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { mockServices } from '@backstage/backend-test-utils';
import { JsonObject } from '@backstage/types';
import express from 'express';
import request from 'supertest';
import { MusterMcpClient } from './MusterMcpClient';
import { createRouter, MUSTER_AUTH_HEADER, RouterOptions } from './router';

describe('createRouter', () => {
  const callTool = jest.fn();
  const listTools = jest.fn();
  const filterTools = jest.fn();
  const describeTool = jest.fn();
  const listCoreTools = jest.fn();
  const getResource = jest.fn();

  const mockClient = {
    callTool,
    listTools,
    filterTools,
    describeTool,
    listCoreTools,
    getResource,
  } as unknown as MusterMcpClient;

  // Mirror the production setup: the backend's root HTTP router applies
  // MiddlewareFactory.error() after plugin routes, mapping @backstage/errors
  // classes to status codes.
  async function buildApp(options: Partial<RouterOptions> = {}) {
    const logger = mockServices.logger.mock();
    const config = mockServices.rootConfig({ data: {} });
    const router = await createRouter({
      logger,
      config,
      client: mockClient,
      ...options,
    });
    const app = express();
    app.use(router);
    app.use(MiddlewareFactory.create({ logger, config }).error());
    return app;
  }

  // Build an app with explicit muster.installations config, still backed by
  // the injected mock client for every installation.
  async function buildMultiApp(installations: JsonObject[]) {
    const logger = mockServices.logger.mock();
    const config = mockServices.rootConfig({
      data: { muster: { installations } },
    });
    const router = await createRouter({ logger, config, client: mockClient });
    const app = express();
    app.use(router);
    app.use(MiddlewareFactory.create({ logger, config }).error());
    return app;
  }

  let app: express.Express;

  beforeEach(async () => {
    callTool.mockReset();
    listTools.mockReset();
    filterTools.mockReset();
    describeTool.mockReset();
    listCoreTools.mockReset();
    getResource.mockReset();
    app = await buildApp();
  });

  it('reports health', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', configured: true });
  });

  it('proxies workflow list', async () => {
    const payload = { workflows: [{ name: 'wf-a', available: true }] };
    callTool.mockResolvedValue(payload);

    const response = await request(app).get('/workflows');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);
    expect(callTool).toHaveBeenCalledWith('core_workflow_list', {}, {});
  });

  it('proxies workflow detail by name', async () => {
    const payload = { workflow: { name: 'wf-a', steps: [] } };
    callTool.mockResolvedValue(payload);

    const response = await request(app).get('/workflows/wf-a');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);
    expect(callTool).toHaveBeenCalledWith(
      'core_workflow_get',
      { name: 'wf-a' },
      {},
    );
  });

  it('proxies execution list with filters', async () => {
    const payload = { executions: [], total: 0 };
    callTool.mockResolvedValue(payload);

    const response = await request(app).get(
      '/executions?workflow_name=wf-a&status=completed&limit=10&offset=20',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);
    expect(callTool).toHaveBeenCalledWith(
      'core_workflow_execution_list',
      {
        workflow_name: 'wf-a',
        status: 'completed',
        limit: 10,
        offset: 20,
      },
      {},
    );
  });

  it('omits unset execution list filters', async () => {
    callTool.mockResolvedValue({ executions: [] });

    await request(app).get('/executions');

    expect(callTool).toHaveBeenCalledWith(
      'core_workflow_execution_list',
      {},
      {},
    );
  });

  it('rejects an invalid execution status', async () => {
    const response = await request(app).get('/executions?status=bogus');

    expect(response.status).toBe(400);
    expect(callTool).not.toHaveBeenCalled();
  });

  it('rejects a repeated status parameter', async () => {
    const response = await request(app).get(
      '/executions?status=completed&status=failed',
    );

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('at most once');
    expect(callTool).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric limit', async () => {
    const response = await request(app).get('/executions?limit=abc');

    expect(response.status).toBe(400);
    expect(callTool).not.toHaveBeenCalled();
  });

  it('rejects an empty limit', async () => {
    const response = await request(app).get('/executions?limit=');

    expect(response.status).toBe(400);
    expect(callTool).not.toHaveBeenCalled();
  });

  it('proxies execution detail with steps', async () => {
    const payload = { execution_id: 'abc', steps: [] };
    callTool.mockResolvedValue(payload);

    const response = await request(app).get('/executions/abc');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);
    expect(callTool).toHaveBeenCalledWith(
      'core_workflow_execution_get',
      {
        execution_id: 'abc',
        include_steps: true,
      },
      {},
    );
  });

  it('returns 503 when no muster server is configured', async () => {
    const logger = mockServices.logger.mock();
    const config = mockServices.rootConfig({ data: {} });
    const router = await createRouter({ logger, config });
    const unconfiguredApp = express();
    unconfiguredApp.use(router);
    unconfiguredApp.use(MiddlewareFactory.create({ logger, config }).error());

    const health = await request(unconfiguredApp).get('/health');
    expect(health.body).toEqual({ status: 'ok', configured: false });

    const response = await request(unconfiguredApp).get('/workflows');
    expect(response.status).toBe(503);
    expect(response.body.error.name).toBe('ServiceUnavailableError');
  });

  it('lists installations', async () => {
    const response = await request(app).get('/installations');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      installations: [
        {
          name: 'muster',
          endpoint: 'injected',
          requiresAuth: false,
        },
      ],
    });
  });

  it('lists tools via the list_tools meta-tool', async () => {
    listTools.mockResolvedValue({ tools: [], servers_requiring_auth: [] });

    const response = await request(app).get('/tools');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ tools: [], servers_requiring_auth: [] });
    expect(listTools).toHaveBeenCalledWith({});
  });

  it('filters tools with query params', async () => {
    filterTools.mockResolvedValue({ tools: [] });

    const response = await request(app).get(
      '/tools/filter?pattern=x_*&query=pods&limit=10&include_schema=true',
    );

    expect(response.status).toBe(200);
    expect(filterTools).toHaveBeenCalledWith(
      { pattern: 'x_*', query: 'pods', limit: 10, include_schema: true },
      {},
    );
  });

  it('describes a tool by name', async () => {
    describeTool.mockResolvedValue({ name: 'x_kubernetes_get' });

    const response = await request(app).get('/tools/x_kubernetes_get');

    expect(response.status).toBe(200);
    expect(describeTool).toHaveBeenCalledWith('x_kubernetes_get', {});
  });

  it('lists core tools', async () => {
    listCoreTools.mockResolvedValue({ tools: [] });

    const response = await request(app).get('/core-tools?include_schema=false');

    expect(response.status).toBe(200);
    expect(listCoreTools).toHaveBeenCalledWith({ include_schema: false }, {});
  });

  it('lists mcp servers via core_mcpserver_list', async () => {
    callTool.mockResolvedValue({ mcpServers: [] });

    const response = await request(app).get('/servers');

    expect(response.status).toBe(200);
    expect(callTool).toHaveBeenCalledWith('core_mcpserver_list', {}, {});
  });

  /**
   * These routes are only active on an installation that forwards a per-user
   * token, so the whole block runs against one and sends the header.
   */
  describe('downstream server auth', () => {
    const TOKEN = 'user-token';
    let authApp: express.Express;

    beforeEach(async () => {
      authApp = await buildMultiApp([
        { name: 'gazelle', url: 'https://muster.gazelle', authProvider: 'dex' },
      ]);
    });

    const login = (body: JsonObject) =>
      request(authApp)
        .post('/auth/login?installation=gazelle')
        .set(MUSTER_AUTH_HEADER, TOKEN)
        .send(body);

    const readStatus = () =>
      request(authApp)
        .get('/auth/status?installation=gazelle')
        .set(MUSTER_AUTH_HEADER, TOKEN);

    it('reads per-server auth status from the auth://status resource', async () => {
      const payload = {
        servers: [{ name: 'pro', status: 'auth_required' }],
      };
      getResource.mockResolvedValue(payload);

      const response = await readStatus();

      expect(response.status).toBe(200);
      expect(response.body).toEqual(payload);
      expect(getResource).toHaveBeenCalledWith('auth://status', {
        authToken: TOKEN,
      });
    });

    /**
     * A muster that doesn't register auth://status is an expected outcome, and
     * the frontend polls this route every few seconds while a sign-in is
     * outstanding -- a >=500 here would be a Sentry stream.
     */
    it('answers an unavailable status resource with an empty list, not a 5xx', async () => {
      getResource.mockRejectedValue(
        new Error('Muster resource auth://status returned no text content'),
      );

      const response = await readStatus();

      expect(response.status).toBe(200);
      // Flagged, not just empty: a waiting row has to be able to tell "nothing
      // needs a sign-in" from "we cannot tell".
      expect(response.body).toEqual({
        servers: [],
        unavailable: true,
        message: 'Muster resource auth://status returned no text content',
      });
    });

    it('returns the sign-in URL from an auth challenge', async () => {
      callTool.mockResolvedValue(
        [
          'Authentication Required',
          '',
          'Server: pro',
          'Status: Authentication required for pro. Please visit the link below to authenticate.',
          '',
          'Please sign in to connect to this server:',
          '',
          'https://muster.gazelle.example.io/oauth/proxy/start?state=abc',
          '',
          'After signing in, run this tool again to complete the connection.',
        ].join('\n'),
      );

      const response = await login({ server: 'pro' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'auth_required',
        authUrl:
          'https://muster.gazelle.example.io/oauth/proxy/start?state=abc',
      });
      expect(callTool).toHaveBeenCalledWith(
        'core_auth_login',
        { server: 'pro' },
        { authToken: TOKEN },
      );
    });

    it('reports an already-connected server as connected', async () => {
      callTool.mockResolvedValue(
        "Server 'pro' is already authenticated and connected.",
      );

      const response = await login({ server: 'pro' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('connected');
    });

    /**
     * Muster refuses a manual login for SSO-managed servers, rate limits, and
     * missing OAuth config as MCP tool errors. Those are expected outcomes of
     * this route, so they must not surface as 5xx (MiddlewareFactory logs those
     * to Sentry regardless of our own log level).
     */
    it('returns a tool-level refusal as a structured 200', async () => {
      callTool.mockRejectedValue(
        new Error("Server 'pro' uses SSO and is connected automatically."),
      );

      const response = await login({ server: 'pro' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'error',
        message: "Server 'pro' uses SSO and is connected automatically.",
      });
    });

    /**
     * The flip side: an outage must NOT be dressed up as muster declining, or
     * the user reads "fetch failed" as a policy decision and Sentry sees
     * nothing.
     */
    it.each([
      ['a transport failure', new TypeError('fetch failed')],
      [
        'a closed client',
        new Error('Attempted to send a request from a closed client'),
      ],
      [
        'an unavailable dependency',
        Object.assign(new Error('no executor'), {
          name: 'ServiceUnavailableError',
        }),
      ],
      // Every non-2xx from muster's endpoint arrives this way, including a 401
      // from its own OAuth proxy.
      [
        'a non-2xx from muster',
        Object.assign(new Error('MCP HTTP Transport Error: (HTTP 502)'), {
          name: 'MCPClientError',
          statusCode: 502,
        }),
      ],
    ])('lets %s keep its 5xx', async (_label, thrown) => {
      callTool.mockRejectedValue(thrown);

      const response = await login({ server: 'pro' });

      expect(response.status).toBeGreaterThanOrEqual(500);
    });

    it('requires a server name', async () => {
      const response = await login({});

      expect(response.status).toBe(400);
      expect(callTool).not.toHaveBeenCalled();
    });

    it('fails with 401 when the user token is missing', async () => {
      const response = await request(authApp)
        .post('/auth/login?installation=gazelle')
        .send({ server: 'pro' });

      expect(response.status).toBe(401);
      expect(callTool).not.toHaveBeenCalled();
    });

    /**
     * Without an authProvider there is no per-user token to key the MCP session
     * cache on, so every portal user shares one muster session -- and one user's
     * completed login would hand the next user their downstream grant.
     */
    describe('installation without per-user auth', () => {
      it('reports no auth-gated servers', async () => {
        const response = await request(app).get('/auth/status');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ servers: [] });
        expect(getResource).not.toHaveBeenCalled();
      });

      it('refuses to start a sign-in', async () => {
        const response = await request(app)
          .post('/auth/login')
          .send({ server: 'pro' });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('error');
        expect(response.body.message).toContain('without an authProvider');
        expect(callTool).not.toHaveBeenCalled();
      });
    });
  });

  describe('/call', () => {
    it('executes any tool unconditionally', async () => {
      callTool.mockResolvedValue({ ok: true });

      const response = await request(app)
        .post('/call')
        .send({ name: 'core_service_list', arguments: {} });

      expect(response.status).toBe(200);
      expect(callTool).toHaveBeenCalledWith('core_service_list', {}, {});
    });

    it('executes a mutating-looking tool without any gate', async () => {
      callTool.mockResolvedValue({ ok: true });

      const response = await request(app)
        .post('/call')
        .send({ name: 'core_service_stop', arguments: { name: 'k8s' } });

      expect(response.status).toBe(200);
      expect(callTool).toHaveBeenCalledWith(
        'core_service_stop',
        { name: 'k8s' },
        {},
      );
    });

    it('requires a name', async () => {
      const response = await request(app).post('/call').send({ arguments: {} });

      expect(response.status).toBe(400);
      expect(callTool).not.toHaveBeenCalled();
    });
  });

  it('computes workflow stats from executions', async () => {
    callTool.mockResolvedValue({
      executions: [
        {
          status: 'completed',
          duration_ms: 100,
          started_at: '2026-06-01T10:00:00Z',
        },
        {
          status: 'failed',
          duration_ms: 300,
          started_at: '2026-06-01T11:00:00Z',
        },
        {
          status: 'completed',
          duration_ms: 200,
          started_at: '2026-06-02T09:00:00Z',
        },
        { status: 'inprogress', started_at: '2026-06-02T09:30:00Z' },
      ],
      total: 4,
    });

    const response = await request(app).get('/workflows/wf-a/stats');

    expect(response.status).toBe(200);
    expect(callTool).toHaveBeenCalledWith(
      'core_workflow_execution_list',
      { workflow_name: 'wf-a', limit: 200, offset: 0 },
      {},
    );
    expect(response.body).toEqual({
      workflow_name: 'wf-a',
      runs: 4,
      sampled: 4,
      completed: 2,
      failed: 1,
      inprogress: 1,
      success_rate: 2 / 3,
      avg_duration_ms: 200,
      max_duration_ms: 300,
      per_day: [
        { date: '2026-06-01', completed: 1, failed: 1 },
        { date: '2026-06-02', completed: 1, failed: 0 },
      ],
    });
  });

  describe('multi-installation routing', () => {
    it('requires the installation parameter when several are configured', async () => {
      const multiApp = await buildMultiApp([
        { name: 'gazelle', url: 'http://g/mcp' },
        { name: 'graveler', url: 'http://gr/mcp' },
      ]);

      const response = await request(multiApp).get('/workflows');

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('installation');
      expect(callTool).not.toHaveBeenCalled();
    });

    it('rejects an unknown installation', async () => {
      const multiApp = await buildMultiApp([
        { name: 'gazelle', url: 'http://g/mcp' },
        { name: 'graveler', url: 'http://gr/mcp' },
      ]);

      const response = await request(multiApp).get(
        '/workflows?installation=nope',
      );

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('nope');
    });

    it('routes to the named installation', async () => {
      const multiApp = await buildMultiApp([
        { name: 'gazelle', url: 'http://g/mcp' },
        { name: 'graveler', url: 'http://gr/mcp' },
      ]);
      callTool.mockResolvedValue({ workflows: [] });

      const response = await request(multiApp).get(
        '/workflows?installation=graveler',
      );

      expect(response.status).toBe(200);
      expect(callTool).toHaveBeenCalledWith('core_workflow_list', {}, {});
    });
  });

  describe('with an authProvider-protected server', () => {
    async function buildAuthApp() {
      const logger = mockServices.logger.mock();
      const config = mockServices.rootConfig({
        data: {
          aiChat: {
            mcp: [
              {
                name: 'muster',
                url: 'http://muster/mcp',
                authProvider: 'mcp-muster',
              },
            ],
          },
        },
      });
      const router = await createRouter({
        logger,
        config,
        client: { callTool } as unknown as MusterMcpClient,
      });
      const authApp = express();
      authApp.use(router);
      authApp.use(MiddlewareFactory.create({ logger, config }).error());
      return authApp;
    }

    it('forwards the user token to the client', async () => {
      const authApp = await buildAuthApp();
      callTool.mockResolvedValue({ workflows: [] });

      const response = await request(authApp)
        .get('/workflows')
        .set(MUSTER_AUTH_HEADER, 'user-token');

      expect(response.status).toBe(200);
      expect(callTool).toHaveBeenCalledWith(
        'core_workflow_list',
        {},
        { authToken: 'user-token' },
      );
    });

    it('returns 401 when the user token is missing', async () => {
      const authApp = await buildAuthApp();

      const response = await request(authApp).get('/workflows');

      expect(response.status).toBe(401);
      expect(response.body.error.message).toContain('mcp-muster');
      expect(callTool).not.toHaveBeenCalled();
    });
  });
});
