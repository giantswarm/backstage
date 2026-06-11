import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { mockServices } from '@backstage/backend-test-utils';
import express from 'express';
import request from 'supertest';
import { MusterMcpClient } from './MusterMcpClient';
import { createRouter, MUSTER_AUTH_HEADER, RouterOptions } from './router';

describe('createRouter', () => {
  const callTool = jest.fn();

  // Mirror the production setup: the backend's root HTTP router applies
  // MiddlewareFactory.error() after plugin routes, mapping @backstage/errors
  // classes to status codes.
  async function buildApp(options: Partial<RouterOptions> = {}) {
    const logger = mockServices.logger.mock();
    const config = mockServices.rootConfig({ data: {} });
    const router = await createRouter({
      logger,
      config,
      client: { callTool } as unknown as MusterMcpClient,
      ...options,
    });
    const app = express();
    app.use(router);
    app.use(MiddlewareFactory.create({ logger, config }).error());
    return app;
  }

  let app: express.Express;

  beforeEach(async () => {
    callTool.mockReset();
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
