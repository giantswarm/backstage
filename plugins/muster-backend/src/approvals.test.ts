import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { mockCredentials, mockServices } from '@backstage/backend-test-utils';
import type { BackstageCredentials } from '@backstage/backend-plugin-api';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';
import type { JsonObject } from '@backstage/types';
import express from 'express';
import request from 'supertest';
import {
  MusterMcpClient,
  ReachabilityCache,
} from '@giantswarm/backstage-plugin-gs-node';
import { approvalIdOf, musterApprovalUrl } from './approvals';
import { createRouter, MUSTER_AUTH_HEADER } from './router';
import {
  OTHER_PERSON_TOKEN,
  PERSON_REF,
  PERSON_TOKEN,
  testJwt,
} from './testPerson';
import { workloadInstallationOf } from './workloadToken';

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
      httpAuth: mockServices.httpAuth({
        defaultCredentials: mockCredentials.user(PERSON_REF),
      }),
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
      .set(MUSTER_AUTH_HEADER, PERSON_TOKEN)
      .send({ url: PAGE });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ view: VIEW });
    expect(response.headers['cache-control']).toBe('no-store');
    const [target, init] = fetchFn.mock.calls[0];
    expect(target).toBe(PAGE);
    expect(init).toEqual(
      expect.objectContaining({ method: 'GET', redirect: 'error' }),
    );
    expect(init.headers.Authorization).toBe(`Bearer ${PERSON_TOKEN}`);
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
      .set(MUSTER_AUTH_HEADER, PERSON_TOKEN)
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
      .set(MUSTER_AUTH_HEADER, PERSON_TOKEN)
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
      .set(MUSTER_AUTH_HEADER, PERSON_TOKEN)
      .send({ url: PAGE, decision: 'approve', digest: 'd1' });

    expect(response.body).toEqual({ status: 'approved' });
    const [target, init] = fetchFn.mock.calls[0];
    expect(target).toBe(`${PAGE}/decision`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      decision: 'approve',
      digest: 'd1',
    });
    expect(init.headers.Authorization).toBe(`Bearer ${PERSON_TOKEN}`);
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
      .set(MUSTER_AUTH_HEADER, PERSON_TOKEN)
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
      .set(MUSTER_AUTH_HEADER, PERSON_TOKEN)
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
        .set(MUSTER_AUTH_HEADER, PERSON_TOKEN)
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

describe('whose token the approval routes and the handoff present', () => {
  const ROUTES = [
    ['/approvals/view', { url: PAGE }],
    ['/approvals/decision', { url: PAGE, decision: 'approve', digest: 'd1' }],
    ['/handoff', { url: PAGE }],
  ] as const;

  async function buildApp(options: {
    fetchFn: typeof fetch;
    credentials?: BackstageCredentials;
    catalog?: CatalogService;
    data?: JsonObject;
  }) {
    const logger = mockServices.logger.mock();
    const config = mockServices.rootConfig({
      data: options.data ?? {
        muster: {
          installations: [
            {
              name: 'gazelle',
              url: 'https://muster.gazelle.example/mcp',
              authProvider: 'dex',
            },
          ],
        },
      },
    });
    const router = await createRouter({
      logger,
      config,
      httpAuth: mockServices.httpAuth({
        defaultCredentials:
          options.credentials ?? mockCredentials.user(PERSON_REF),
      }),
      client: {} as MusterMcpClient,
      reachability: new ReachabilityCache({
        probe: async () => ({ reachable: true, checkedAt: 0 }),
      }),
      handoffFetch: options.fetchFn,
      workloadToken: async () => 'portal-workload-token',
      ...(options.catalog && { catalog: options.catalog }),
    });
    const app = express();
    app.use(router);
    app.use(MiddlewareFactory.create({ logger, config }).error());
    return { app, logger };
  }

  const viewOrTicket = () =>
    jest.fn(async (input: string | URL | Request) => {
      const target = String(input);
      if (target.endsWith('/handoff-tickets')) {
        return answer(201, { ticket: 'T1' });
      }
      return answer(
        200,
        target.endsWith('/decision') ? { status: 'approved' } : VIEW,
      );
    }) as jest.Mock & typeof fetch;

  it.each(ROUTES)(
    "%s presents the signed-in person's own token",
    async (route, body) => {
      const fetchFn = viewOrTicket();
      const { app } = await buildApp({ fetchFn });

      const response = await request(app)
        .post(`${route}?installation=gazelle`)
        .set(MUSTER_AUTH_HEADER, PERSON_TOKEN)
        .send(body);

      expect(response.status).toBe(200);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    },
  );

  it.each(ROUTES)(
    "%s refuses another person's token from a signed-in portal user before muster is called",
    async (route, body) => {
      const fetchFn = viewOrTicket();
      const { app, logger } = await buildApp({ fetchFn });

      const response = await request(app)
        .post(`${route}?installation=gazelle`)
        .set(MUSTER_AUTH_HEADER, OTHER_PERSON_TOKEN)
        .send(body);

      expect(response.status).toBe(403);
      expect(fetchFn).not.toHaveBeenCalled();
      const logged = JSON.stringify((logger.info as jest.Mock).mock.calls);
      expect(logged).toContain('muster_token_not_own');
      expect(logged).toContain(PERSON_REF);
      expect(logged).not.toContain(OTHER_PERSON_TOKEN.split('.')[1]);
    },
  );

  it.each(ROUTES)(
    '%s refuses a request without a user',
    async (route, body) => {
      const fetchFn = viewOrTicket();
      const { app } = await buildApp({
        fetchFn,
        credentials: mockCredentials.none(),
      });

      const response = await request(app)
        .post(`${route}?installation=gazelle`)
        .set(MUSTER_AUTH_HEADER, PERSON_TOKEN)
        .send(body);

      expect(response.status).toBe(401);
      expect(fetchFn).not.toHaveBeenCalled();
    },
  );

  it('refuses a service principal and the shared guest', async () => {
    for (const credentials of [
      mockCredentials.service('plugin:other'),
      mockCredentials.user('user:default/guest'),
    ]) {
      const fetchFn = viewOrTicket();
      const { app } = await buildApp({ fetchFn, credentials });

      const response = await request(app)
        .post('/approvals/decision?installation=gazelle')
        .set(MUSTER_AUTH_HEADER, PERSON_TOKEN)
        .send({ url: PAGE, decision: 'approve', digest: 'd1' });

      expect(response.status).toBe(403);
      expect(fetchFn).not.toHaveBeenCalled();
    }
  });

  describe('a staff person, found in the catalog', () => {
    const staff = (connector: string, claims: Record<string, unknown>) =>
      testJwt({
        iss: 'https://dex.gazelle.example',
        sub: `${connector}-subject`,
        federated_claims: { connector_id: connector, user_id: 'u1' },
        ...claims,
      });
    const catalog = catalogServiceMock({
      entities: [
        {
          apiVersion: 'backstage.io/v1alpha1',
          kind: 'User',
          metadata: { name: 'alice', namespace: 'default' },
          spec: { profile: { email: 'alice@giantswarm.io' } },
        },
      ],
    });
    const decide = async (token: string, withCatalog = true) => {
      const fetchFn = viewOrTicket();
      const { app } = await buildApp({
        fetchFn,
        credentials: mockCredentials.user('user:default/alice'),
        ...(withCatalog && { catalog }),
      });
      const response = await request(app)
        .post('/approvals/decision?installation=gazelle')
        .set(MUSTER_AUTH_HEADER, token)
        .send({ url: PAGE, decision: 'approve', digest: 'd1' });
      return { status: response.status, called: fetchFn.mock.calls.length };
    };

    it('presents their token by verified email or GitHub username', async () => {
      await expect(
        decide(
          staff('giantswarm-ad', {
            email: 'Alice@giantswarm.io',
            email_verified: true,
          }),
        ),
      ).resolves.toEqual({ status: 200, called: 1 });
      await expect(
        decide(staff('giantswarm-github', { preferred_username: 'alice' })),
      ).resolves.toEqual({ status: 200, called: 1 });
    });

    it("refuses another staff person's token, an unverified email and no catalog", async () => {
      for (const token of [
        staff('giantswarm-ad', {
          email: 'bob@giantswarm.io',
          email_verified: true,
        }),
        staff('giantswarm-ad', {
          email: 'alice@giantswarm.io',
          email_verified: false,
        }),
        staff('giantswarm-github', { preferred_username: 'bob' }),
      ]) {
        await expect(decide(token)).resolves.toEqual({
          status: 403,
          called: 0,
        });
      }
      await expect(
        decide(
          staff('giantswarm-ad', {
            email: 'alice@giantswarm.io',
            email_verified: true,
          }),
          false,
        ),
      ).resolves.toEqual({ status: 403, called: 0 });
    });
  });

  describe("the portal's workload token goes to its own installation's muster only", () => {
    const data = {
      gs: {
        authProvider: 'oidc-gazelle',
        installations: {
          gazelle: {
            baseDomain: 'gazelle.example',
            oidcTokenProvider: 'oidc-gazelle',
          },
          other: {
            baseDomain: 'other.example',
            oidcTokenProvider: 'oidc-other',
          },
        },
      },
    };
    const OTHER_PAGE = `https://muster.other.example/approvals/${ID}`;

    it('sends it to the home installation', async () => {
      const fetchFn = viewOrTicket();
      const { app } = await buildApp({ fetchFn, data });

      await request(app)
        .post('/approvals/view?installation=gazelle')
        .set(MUSTER_AUTH_HEADER, PERSON_TOKEN)
        .send({ url: PAGE })
        .expect(200);

      expect(fetchFn.mock.calls[0][0]).toBe(PAGE);
      expect(
        (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1]
          .headers as Record<string, string>,
      ).toHaveProperty('X-Muster-Approval-Client', 'portal-workload-token');
    });

    it('asks no other muster, and says why', async () => {
      const fetchFn = viewOrTicket();
      const { app } = await buildApp({ fetchFn, data });

      const view = await request(app)
        .post('/approvals/view?installation=other')
        .set(MUSTER_AUTH_HEADER, PERSON_TOKEN)
        .send({ url: OTHER_PAGE });
      const decision = await request(app)
        .post('/approvals/decision?installation=other')
        .set(MUSTER_AUTH_HEADER, PERSON_TOKEN)
        .send({ url: OTHER_PAGE, decision: 'approve', digest: 'd1' });
      const handoff = await request(app)
        .post('/handoff?installation=other')
        .set(MUSTER_AUTH_HEADER, PERSON_TOKEN)
        .send({ url: OTHER_PAGE });

      expect(view.body.refusal).toEqual(
        expect.objectContaining({ status: 403, error: 'untrusted_workload' }),
      );
      expect(decision.body.refusal).toEqual(
        expect.objectContaining({ status: 403, error: 'untrusted_workload' }),
      );
      expect(handoff.body).toEqual({});
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });
});

describe('workloadInstallationOf', () => {
  const of = (data: JsonObject, names: string[]) =>
    workloadInstallationOf(
      mockServices.rootConfig({ data }),
      names,
      mockServices.logger.mock(),
    );

  it('takes muster.workloadInstallation when it names a muster installation', () => {
    expect(of({ muster: { workloadInstallation: 'b' } }, ['a', 'b'])).toBe('b');
    expect(
      of({ muster: { workloadInstallation: 'c' } }, ['a']),
    ).toBeUndefined();
  });

  it('else the home installation, else the only one, else none', () => {
    const gs = {
      authProvider: 'oidc-b',
      installations: {
        a: { oidcTokenProvider: 'oidc-a' },
        b: { oidcTokenProvider: 'oidc-b' },
      },
    };
    expect(of({ gs }, ['a', 'b'])).toBe('b');
    expect(of({}, ['a'])).toBe('a');
    expect(of({}, ['a', 'b'])).toBeUndefined();
    expect(
      of({ gs: { ...gs, authProvider: 'oidc-x' } }, ['a', 'b']),
    ).toBeUndefined();
  });
});
