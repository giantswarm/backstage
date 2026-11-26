import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { mockServices } from '@backstage/backend-test-utils';
import express from 'express';
import request from 'supertest';
import {
  MusterMcpClient,
  ReachabilityCache,
} from '@giantswarm/backstage-plugin-gs-node';
import { approvalIdOf, musterApprovalUrl } from './approvals';
import { createRouter, MUSTER_AUTH_HEADER } from './router';

const ID = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const PAGE = `https://muster.gazelle.example/approvals/${ID}`;
const VIEW = { id: ID, status: 'pending', digest: 'd1', heading: 'Approve?' };

function answer(status: number, body: unknown = {}): Response {
  return { status, json: async () => body } as Response;
}

describe('approval helpers', () => {
  const installation = { url: 'https://muster.gazelle.example/mcp' };

  it("reads the id of a link to the installation's approval page only", () => {
    expect(approvalIdOf(PAGE, installation)).toBe(ID);
    expect(
      approvalIdOf(`https://evil.example/approvals/${ID}`, installation),
    ).toBeUndefined();
    expect(approvalIdOf(`${PAGE}/decision`, installation)).toBeUndefined();
    expect(approvalIdOf(`${PAGE}?handoff=x`, installation)).toBeUndefined();
    expect(
      approvalIdOf(
        'https://muster.gazelle.example/oauth/proxy/start',
        installation,
      ),
    ).toBeUndefined();
    expect(approvalIdOf('not a url', installation)).toBeUndefined();
    expect(
      approvalIdOf(`https://pages.example/m/approvals/${ID}`, {
        ...installation,
        publicUrl: 'https://pages.example/m',
      }),
    ).toBe(ID);
  });

  it("calls muster's approval resource next to the MCP endpoint", () => {
    expect(musterApprovalUrl('https://muster.gazelle.example/mcp', ID)).toBe(
      `https://muster.gazelle.example/approvals/${ID}`,
    );
  });
});

describe('approval routes', () => {
  async function buildApp(
    fetchFn: typeof fetch,
    authProvider = 'dex',
    workload: string | null = 'portal-workload-token',
  ) {
    const logger = mockServices.logger.mock();
    const config = mockServices.rootConfig({
      data: {
        muster: {
          installations: [
            {
              name: 'gazelle',
              url: 'https://muster.gazelle.example/mcp',
              ...(authProvider && { authProvider }),
            },
          ],
        },
      },
    });
    const router = await createRouter({
      logger,
      config,
      httpAuth: mockServices.httpAuth(),
      client: {} as MusterMcpClient,
      reachability: new ReachabilityCache({
        probe: async () => ({ reachable: true, checkedAt: 0 }),
      }),
      handoffFetch: fetchFn,
      workloadToken: async () => workload ?? undefined,
    });
    const app = express();
    app.use(router);
    app.use(MiddlewareFactory.create({ logger, config }).error());
    return { app, logger };
  }

  it("shows the approval muster shows the person's client", async () => {
    const fetchFn = jest.fn().mockResolvedValue(answer(200, VIEW));
    const { app } = await buildApp(fetchFn);

    const response = await request(app)
      .post('/approvals/view?installation=gazelle')
      .set(MUSTER_AUTH_HEADER, 'person-token')
      .send({ url: PAGE });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ view: VIEW });
    expect(response.headers['cache-control']).toBe('no-store');
    const [target, init] = fetchFn.mock.calls[0];
    expect(target).toBe(PAGE);
    expect(init).toEqual(
      expect.objectContaining({ method: 'GET', redirect: 'error' }),
    );
    expect(init.headers.Authorization).toBe('Bearer person-token');
    expect(init.headers['X-Muster-Approval-Client']).toBe(
      'portal-workload-token',
    );
  });

  it('sends no workload header without a workload token, and muster refuses', async () => {
    const fetchFn = jest.fn().mockResolvedValue(
      answer(403, {
        error: 'untrusted_workload',
        message: 'This client did not prove its own identity',
      }),
    );
    const { app } = await buildApp(fetchFn, 'dex', null);

    const response = await request(app)
      .post('/approvals/decision?installation=gazelle')
      .set(MUSTER_AUTH_HEADER, 'person-token')
      .send({ url: PAGE, decision: 'approve', digest: 'd1' });

    const [, init] = fetchFn.mock.calls[0];
    expect(init.headers).not.toHaveProperty('X-Muster-Approval-Client');
    expect(response.body.refusal).toEqual(
      expect.objectContaining({ status: 403, error: 'untrusted_workload' }),
    );
  });

  it("passes muster's refusal on", async () => {
    const { app } = await buildApp(
      jest
        .fn()
        .mockResolvedValue(
          answer(403, { error: 'foreign', message: 'someone else' }),
        ),
    );

    const response = await request(app)
      .post('/approvals/view?installation=gazelle')
      .set(MUSTER_AUTH_HEADER, 'person-token')
      .send({ url: PAGE });

    expect(response.body).toEqual({
      refusal: { status: 403, error: 'foreign', message: 'someone else' },
    });
  });

  it('posts the decision with the digest and answers what muster decided', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(answer(200, { status: 'approved' }));
    const { app } = await buildApp(fetchFn);

    const response = await request(app)
      .post('/approvals/decision?installation=gazelle')
      .set(MUSTER_AUTH_HEADER, 'person-token')
      .send({ url: PAGE, decision: 'approve', digest: 'd1' });

    expect(response.body).toEqual({ status: 'approved' });
    const [target, init] = fetchFn.mock.calls[0];
    expect(target).toBe(`${PAGE}/decision`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      decision: 'approve',
      digest: 'd1',
    });
    expect(init.headers.Authorization).toBe('Bearer person-token');
    expect(init.headers['X-Muster-Approval-Client']).toBe(
      'portal-workload-token',
    );
  });

  it('says what stands when the request was already decided', async () => {
    const { app } = await buildApp(
      jest
        .fn()
        .mockResolvedValue(
          answer(409, { error: 'decided', status: 'declined', message: 'x' }),
        ),
    );

    const response = await request(app)
      .post('/approvals/decision?installation=gazelle')
      .set(MUSTER_AUTH_HEADER, 'person-token')
      .send({ url: PAGE, decision: 'approve', digest: 'd1' });

    expect(response.body).toEqual({
      refusal: {
        status: 409,
        error: 'decided',
        message: 'x',
        decided: 'declined',
      },
    });
  });

  it('answers unreachable when muster cannot be reached', async () => {
    const { app } = await buildApp(
      jest.fn().mockRejectedValue(new TypeError('fetch failed')),
    );

    const response = await request(app)
      .post('/approvals/decision?installation=gazelle')
      .set(MUSTER_AUTH_HEADER, 'person-token')
      .send({ url: PAGE, decision: 'decline', digest: 'd1' });

    expect(response.body.refusal).toEqual(
      expect.objectContaining({ status: 502, error: 'unreachable' }),
    );
  });

  it('refuses links that are no approval page of the installation, and bad decisions', async () => {
    const fetchFn = jest.fn();
    const { app } = await buildApp(fetchFn);

    for (const body of [
      { url: `https://evil.example/approvals/${ID}` },
      { url: 'https://muster.gazelle.example/oauth/proxy/start?state=x' },
      { url: PAGE, decision: 'maybe', digest: 'd1' },
      { url: PAGE, decision: 'approve' },
    ]) {
      const path = 'decision' in body ? 'decision' : 'view';
      const response = await request(app)
        .post(`/approvals/${path}?installation=gazelle`)
        .set(MUSTER_AUTH_HEADER, 'person-token')
        .send(body);
      expect(response.status).toBe(400);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("needs the person's token", async () => {
    const fetchFn = jest.fn();
    const { app } = await buildApp(fetchFn);

    const response = await request(app)
      .post('/approvals/decision?installation=gazelle')
      .send({ url: PAGE, decision: 'approve', digest: 'd1' });

    expect(response.status).toBe(401);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
