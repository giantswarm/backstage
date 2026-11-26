import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { mockCredentials, mockServices } from '@backstage/backend-test-utils';
import express from 'express';
import request from 'supertest';
import {
  MusterMcpClient,
  ReachabilityCache,
} from '@giantswarm/backstage-plugin-gs-node';
import {
  isOnMusterPages,
  musterHandoffUrl,
  requestHandoffTicket,
} from './handoff';
import { createRouter, MUSTER_AUTH_HEADER } from './router';
import { PERSON_REF, PERSON_TOKEN } from './testPerson';

const PAGE =
  'https://muster.gazelle.example/approvals/ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function answer(status: number, body: unknown = {}): Response {
  return {
    status,
    json: async () => body,
  } as Response;
}

describe('handoff helpers', () => {
  it('posts to the handoff endpoint next to the MCP endpoint', () => {
    expect(musterHandoffUrl('https://muster.gazelle.example/mcp')).toBe(
      'https://muster.gazelle.example/handoff-tickets',
    );
    expect(musterHandoffUrl('https://muster.gazelle.example/')).toBe(
      'https://muster.gazelle.example/handoff-tickets',
    );
  });

  it("admits only links on the installation's muster pages", () => {
    const installation = { url: 'https://muster.gazelle.example/mcp' };
    expect(isOnMusterPages(PAGE, installation)).toBe(true);
    expect(
      isOnMusterPages('https://evil.example/approvals/X', installation),
    ).toBe(false);
    expect(
      isOnMusterPages('ftp://muster.gazelle.example/x', installation),
    ).toBe(false);
    expect(isOnMusterPages('not a url', installation)).toBe(false);
    expect(
      isOnMusterPages('https://pages.example/approvals/X', {
        ...installation,
        publicUrl: 'https://pages.example',
      }),
    ).toBe(true);
  });

  it("asks muster with the person's bearer and returns its ticket", async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(answer(201, { ticket: 'T1', expiresIn: 60 }));
    const logger = mockServices.logger.mock();

    const ticket = await requestHandoffTicket({
      installation: {
        name: 'gazelle',
        url: 'https://muster.gazelle.example/mcp',
      },
      url: PAGE,
      token: PERSON_TOKEN,
      logger,
      fetchFn,
    });

    expect(ticket).toBe('T1');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://muster.gazelle.example/handoff-tickets',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${PERSON_TOKEN}`,
        }),
        body: JSON.stringify({ url: PAGE }),
        redirect: 'error',
      }),
    );
  });

  it.each([
    ['a refusal', async () => answer(403)],
    ['an older muster', async () => answer(404)],
    ['an answer without a ticket', async () => answer(201, {})],
    [
      'muster unreachable',
      async () => {
        throw new TypeError('fetch failed');
      },
    ],
  ])('returns no ticket on %s, and never logs one', async (_, impl) => {
    const logger = mockServices.logger.mock();
    const ticket = await requestHandoffTicket({
      installation: {
        name: 'gazelle',
        url: 'https://muster.gazelle.example/mcp',
      },
      url: PAGE,
      token: PERSON_TOKEN,
      logger,
      fetchFn: jest.fn().mockImplementation(impl),
    });

    expect(ticket).toBeUndefined();
    expect(JSON.stringify((logger.info as jest.Mock).mock.calls)).not.toContain(
      PERSON_TOKEN,
    );
  });
});

describe('POST /handoff', () => {
  async function buildApp(fetchFn: typeof fetch, authProvider?: string) {
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
      httpAuth: mockServices.httpAuth({
        defaultCredentials: mockCredentials.user(PERSON_REF),
      }),
      client: {} as MusterMcpClient,
      reachability: new ReachabilityCache({
        probe: async () => ({ reachable: true, checkedAt: 0 }),
      }),
      handoffFetch: fetchFn,
      workloadToken: async () => 'portal-workload-token',
    });
    const app = express();
    app.use(router);
    app.use(MiddlewareFactory.create({ logger, config }).error());
    return { app, logger };
  }

  it('returns the ticket muster issued for the person', async () => {
    const fetchFn = jest.fn().mockResolvedValue(answer(201, { ticket: 'T1' }));
    const { app, logger } = await buildApp(fetchFn, 'dex');

    const response = await request(app)
      .post('/handoff?installation=gazelle')
      .set(MUSTER_AUTH_HEADER, PERSON_TOKEN)
      .send({ url: PAGE });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ticket: 'T1' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe(
      `Bearer ${PERSON_TOKEN}`,
    );
    expect(fetchFn.mock.calls[0][1].headers['X-Muster-Approval-Client']).toBe(
      'portal-workload-token',
    );
    expect(
      JSON.stringify([
        (logger.info as jest.Mock).mock.calls,
        (logger.warn as jest.Mock).mock.calls,
      ]),
    ).not.toContain('T1');
  });

  it('answers without a ticket when muster issues none', async () => {
    const { app } = await buildApp(
      jest.fn().mockResolvedValue(answer(403)),
      'dex',
    );

    const response = await request(app)
      .post('/handoff?installation=gazelle')
      .set(MUSTER_AUTH_HEADER, PERSON_TOKEN)
      .send({ url: PAGE });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({});
  });

  it("refuses a link that is not on the installation's muster pages", async () => {
    const fetchFn = jest.fn();
    const { app } = await buildApp(fetchFn, 'dex');

    const response = await request(app)
      .post('/handoff?installation=gazelle')
      .set(MUSTER_AUTH_HEADER, PERSON_TOKEN)
      .send({ url: 'https://evil.example/approvals/X' });

    expect(response.status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("needs the person's token", async () => {
    const fetchFn = jest.fn();
    const { app } = await buildApp(fetchFn, 'dex');

    const response = await request(app)
      .post('/handoff?installation=gazelle')
      .send({ url: PAGE });

    expect(response.status).toBe(401);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('asks for nothing on an installation without per-user sessions', async () => {
    const fetchFn = jest.fn();
    const { app } = await buildApp(fetchFn);

    const response = await request(app)
      .post('/handoff?installation=gazelle')
      .send({ url: PAGE });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({});
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
