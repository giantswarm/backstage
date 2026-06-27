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

  const mockClient = {
    callTool,
    listTools,
    filterTools,
    describeTool,
    listCoreTools,
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
        { name: 'muster', requiresAuth: false, allowMutations: false },
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

  describe('/call safety guard', () => {
    it('allows a read-only tool by default', async () => {
      callTool.mockResolvedValue({ ok: true });

      const response = await request(app)
        .post('/call')
        .send({ name: 'core_service_list', arguments: {} });

      expect(response.status).toBe(200);
      expect(callTool).toHaveBeenCalledWith('core_service_list', {}, {});
    });

    it('rejects a mutating tool on a read-only installation', async () => {
      const response = await request(app)
        .post('/call')
        .send({ name: 'core_service_stop', arguments: { name: 'k8s' } });

      expect(response.status).toBe(403);
      expect(response.body.error.name).toBe('NotAllowedError');
      expect(callTool).not.toHaveBeenCalled();
    });

    it('allows a mutating tool when the installation opts in', async () => {
      const mutApp = await buildMultiApp([
        { name: 'gazelle', url: 'http://g/mcp', allowMutations: true },
      ]);
      callTool.mockResolvedValue({ ok: true });

      const response = await request(mutApp)
        .post('/call?installation=gazelle')
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

  it('refuses to run a workflow on a read-only installation', async () => {
    const response = await request(app)
      .post('/workflows/wf-a/run')
      .send({ arguments: { foo: 'bar' } });

    expect(response.status).toBe(403);
    expect(callTool).not.toHaveBeenCalled();
  });

  it('runs a workflow when mutations are enabled', async () => {
    const mutApp = await buildMultiApp([
      { name: 'gazelle', url: 'http://g/mcp', allowMutations: true },
    ]);
    callTool.mockResolvedValue({ execution_id: 'abc' });

    const response = await request(mutApp)
      .post('/workflows/wf-a/run?installation=gazelle')
      .send({ arguments: { foo: 'bar' } });

    expect(response.status).toBe(200);
    expect(callTool).toHaveBeenCalledWith('workflow_wf-a', { foo: 'bar' }, {});
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
