import { mockServices } from '@backstage/backend-test-utils';
import express from 'express';
import request from 'supertest';
import { MusterMcpClient } from './MusterMcpClient';
import { createRouter } from './router';

describe('createRouter', () => {
  const callTool = jest.fn();
  let app: express.Express;

  beforeEach(async () => {
    callTool.mockReset();
    const router = await createRouter({
      logger: mockServices.logger.mock(),
      config: mockServices.rootConfig({ data: {} }),
      client: { callTool } as unknown as MusterMcpClient,
    });
    app = express();
    app.use(router);
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
    expect(callTool).toHaveBeenCalledWith('core_workflow_list', {});
  });

  it('proxies workflow detail by name', async () => {
    const payload = { workflow: { name: 'wf-a', steps: [] } };
    callTool.mockResolvedValue(payload);

    const response = await request(app).get('/workflows/wf-a');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);
    expect(callTool).toHaveBeenCalledWith('core_workflow_get', {
      name: 'wf-a',
    });
  });

  it('proxies execution list with filters', async () => {
    const payload = { executions: [], total: 0 };
    callTool.mockResolvedValue(payload);

    const response = await request(app).get(
      '/executions?workflow_name=wf-a&status=completed&limit=10&offset=20',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);
    expect(callTool).toHaveBeenCalledWith('core_workflow_execution_list', {
      workflow_name: 'wf-a',
      status: 'completed',
      limit: 10,
      offset: 20,
    });
  });

  it('omits unset execution list filters', async () => {
    callTool.mockResolvedValue({ executions: [] });

    await request(app).get('/executions');

    expect(callTool).toHaveBeenCalledWith('core_workflow_execution_list', {});
  });

  it('rejects an invalid execution status', async () => {
    const response = await request(app).get('/executions?status=bogus');

    expect(response.status).toBe(400);
    expect(callTool).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric limit', async () => {
    const response = await request(app).get('/executions?limit=abc');

    expect(response.status).toBe(400);
    expect(callTool).not.toHaveBeenCalled();
  });

  it('proxies execution detail with steps', async () => {
    const payload = { execution_id: 'abc', steps: [] };
    callTool.mockResolvedValue(payload);

    const response = await request(app).get('/executions/abc');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);
    expect(callTool).toHaveBeenCalledWith('core_workflow_execution_get', {
      execution_id: 'abc',
      include_steps: true,
    });
  });

  it('returns 503 when no muster server is configured', async () => {
    const router = await createRouter({
      logger: mockServices.logger.mock(),
      config: mockServices.rootConfig({ data: {} }),
    });
    const unconfiguredApp = express();
    unconfiguredApp.use(router);

    const health = await request(unconfiguredApp).get('/health');
    expect(health.body).toEqual({ status: 'ok', configured: false });

    const response = await request(unconfiguredApp).get('/workflows');
    expect(response.status).toBe(503);
  });
});
