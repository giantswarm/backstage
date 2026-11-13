import { ConfigReader } from '@backstage/config';
import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { mockServices } from '@backstage/backend-test-utils';
import express from 'express';
import request from 'supertest';
import {
  AGENT_MANAGER_AUTH_HEADER,
  agentManagerBaseUrl,
  createCredentialOperationsRouter,
} from './credentialOperationsRouter';

const config = new ConfigReader({
  gs: {
    installations: {
      gazelle: { baseDomain: 'gazelle.example' },
      graveler: { baseDomain: 'graveler.example' },
      bare: {},
    },
  },
  agentPlatform: {
    agentManager: {
      installations: {
        graveler: { apiBaseUrl: 'https://manager.graveler.example/am/' },
      },
    },
  },
});

const OPERATION = 'a1'.repeat(24);
const SECRET_VALUE = 'sk-ant-do-not-echo';

function app(
  fetchFn: typeof fetch,
  timeouts: { readTimeoutMs?: number; saveTimeoutMs?: number } = {},
) {
  const logger = mockServices.logger.mock();
  const middleware = MiddlewareFactory.create({
    logger,
    config: new ConfigReader({}),
  });
  return express()
    .use(express.json({ limit: '256kb' }))
    .use(createCredentialOperationsRouter({ config, fetchFn, ...timeouts }))
    .use(middleware.error());
}

function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function mockFetch(answer: () => Response) {
  return jest.fn(async (_url: any, _init: any) => answer());
}

describe('agentManagerBaseUrl', () => {
  it('derives the agent-platform chart’s route and takes a configured origin first', () => {
    expect(agentManagerBaseUrl(config, 'gazelle')).toBe(
      'https://agentgateway.gazelle.example/agent-manager',
    );
    expect(agentManagerBaseUrl(config, 'graveler')).toBe(
      'https://manager.graveler.example/am',
    );
    expect(agentManagerBaseUrl(config, 'bare')).toBeUndefined();
    expect(agentManagerBaseUrl(config, 'gazelle.baseDomain')).toBeUndefined();
  });
});

describe('the credential operations', () => {
  const path = `/organizations/credential-operations/${OPERATION}?installation=gazelle`;
  const upstream = `https://agentgateway.gazelle.example/agent-manager/api/v1/credential-operations/${OPERATION}`;

  it('reads the confirmation as the person and passes its ETag on', async () => {
    const fetchFn = mockFetch(() =>
      json(200, { id: OPERATION, state: 'pending' }, { ETag: '"7"' }),
    );
    const res = await request(app(fetchFn as unknown as typeof fetch))
      .get(path)
      .set(AGENT_MANAGER_AUTH_HEADER, 'id-token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: OPERATION, state: 'pending' });
    expect(res.headers.etag).toBe('"7"');
    expect(res.headers['cache-control']).toBe('no-store');
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(upstream);
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer id-token');
    expect(init.redirect).toBe('error');
  });

  it('saves the values once, with If-Match, and answers the receipt', async () => {
    const fetchFn = mockFetch(() =>
      json(200, { kind: 'ModelConfig', name: 'claude', credentials: [] }),
    );
    const values = [
      {
        secret: 'tenant-credential-claude',
        key: 'apiKey',
        value: SECRET_VALUE,
      },
    ];
    const res = await request(app(fetchFn as unknown as typeof fetch))
      .post(path)
      .set(AGENT_MANAGER_AUTH_HEADER, 'id-token')
      .set('If-Match', '"7"')
      .send({ values });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('claude');
    expect(JSON.stringify(res.body)).not.toContain(SECRET_VALUE);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(upstream);
    expect(init.method).toBe('POST');
    expect(init.headers['If-Match']).toBe('"7"');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ values });
  });

  it('keeps agent-manager’s code and never echoes the value in an error', async () => {
    const fetchFn = mockFetch(() =>
      json(412, {
        error: {
          code: 'precondition_failed',
          message: 'the operation changed; read it again',
        },
      }),
    );
    const res = await request(app(fetchFn as unknown as typeof fetch))
      .post(path)
      .set(AGENT_MANAGER_AUTH_HEADER, 'id-token')
      .set('If-Match', '"6"')
      .send({
        values: [
          {
            secret: 'tenant-credential-claude',
            key: 'apiKey',
            value: SECRET_VALUE,
          },
        ],
      });

    expect(res.status).toBe(412);
    expect(res.body.error).toMatchObject({
      code: 'precondition_failed',
      message: 'the operation changed; read it again',
    });
    expect(JSON.stringify(res.body)).not.toContain(SECRET_VALUE);
  });

  it('answers 502 when agent-manager cannot be reached', async () => {
    const fetchFn = jest.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const res = await request(app(fetchFn as unknown as typeof fetch))
      .get(path)
      .set(AGENT_MANAGER_AUTH_HEADER, 'id-token');
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('backend_error');
  });

  it('answers a save that runs past its time as an unknown outcome, not a failure', async () => {
    const fetchFn = jest.fn(
      (_url: any, init: any) =>
        new Promise<Response>((_resolve, reject) =>
          init.signal.addEventListener('abort', () =>
            reject(init.signal.reason),
          ),
        ),
    );
    const res = await request(
      app(fetchFn as unknown as typeof fetch, { saveTimeoutMs: 20 }),
    )
      .post(path)
      .set(AGENT_MANAGER_AUTH_HEADER, 'id-token')
      .set('If-Match', '"7"')
      .send({
        values: [
          {
            secret: 'tenant-credential-claude',
            key: 'apiKey',
            value: SECRET_VALUE,
          },
        ],
      });

    expect(res.status).toBe(504);
    expect(res.body.error).toMatchObject({
      name: 'AgentManagerError',
      code: 'outcome_unknown',
    });
    expect(res.body.response).toEqual({ statusCode: 504 });
    expect(JSON.stringify(res.body)).not.toContain(SECRET_VALUE);
  });

  it.each([
    [
      'a dropped connection',
      () => Promise.reject(new TypeError('fetch failed')),
      502,
    ],
    [
      'a gateway’s 502 page',
      async () => new Response('<html>bad gateway</html>', { status: 502 }),
      502,
    ],
    [
      'a gateway’s 504 page',
      async () => new Response('upstream timeout', { status: 504 }),
      504,
    ],
  ])(
    'answers a save that ends in %s as an unknown outcome',
    async (_case, answer, status) => {
      const fetchFn = jest.fn(answer);
      const res = await request(app(fetchFn as unknown as typeof fetch))
        .post(path)
        .set(AGENT_MANAGER_AUTH_HEADER, 'id-token')
        .set('If-Match', '"7"')
        .send({
          values: [
            {
              secret: 'tenant-credential-claude',
              key: 'apiKey',
              value: SECRET_VALUE,
            },
          ],
        });

      expect(res.status).toBe(status);
      expect(res.body.error.code).toBe('outcome_unknown');
      expect(res.headers['cache-control']).toBe('no-store');
    },
  );

  it('keeps agent-manager’s own 5xx refusal of a save as a failure', async () => {
    const fetchFn = mockFetch(() =>
      json(500, { error: { code: 'backend_error', message: 'apply failed' } }),
    );
    const res = await request(app(fetchFn as unknown as typeof fetch))
      .post(path)
      .set(AGENT_MANAGER_AUTH_HEADER, 'id-token')
      .set('If-Match', '"7"')
      .send({ values: [] });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatchObject({
      code: 'backend_error',
      message: 'apply failed',
    });
  });

  it('answers its own refusals of a request no-store too', async () => {
    const fetchFn = mockFetch(() => json(200, {}));
    const res = await request(app(fetchFn as unknown as typeof fetch))
      .post(path)
      .set(AGENT_MANAGER_AUTH_HEADER, 'id-token')
      .set('If-Match', '7')
      .send({ values: [] });
    expect(res.status).toBe(400);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('answers 502 for a confirmation without its version, or a body that is not JSON', async () => {
    const noEtag = mockFetch(() => json(200, { id: OPERATION }));
    const first = await request(app(noEtag as unknown as typeof fetch))
      .get(path)
      .set(AGENT_MANAGER_AUTH_HEADER, 'id-token');
    expect(first.status).toBe(502);

    const html = mockFetch(
      () =>
        new Response('<html>gateway</html>', {
          status: 200,
          headers: { ETag: '"7"' },
        }),
    );
    const second = await request(app(html as unknown as typeof fetch))
      .get(path)
      .set(AGENT_MANAGER_AUTH_HEADER, 'id-token');
    expect(second.status).toBe(502);
    expect(second.body.error.code).toBe('backend_error');
  });

  it('refuses a cancellation without If-Match with 428', async () => {
    const fetchFn = mockFetch(() => new Response(null, { status: 204 }));
    const res = await request(app(fetchFn as unknown as typeof fetch))
      .delete(path)
      .set(AGENT_MANAGER_AUTH_HEADER, 'id-token');
    expect(res.status).toBe(428);
    expect(res.body.error.code).toBe('precondition_required');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('cancels with If-Match', async () => {
    const fetchFn = mockFetch(() => new Response(null, { status: 204 }));
    const res = await request(app(fetchFn as unknown as typeof fetch))
      .delete(path)
      .set(AGENT_MANAGER_AUTH_HEADER, 'id-token')
      .set('If-Match', '"7"');
    expect(res.status).toBe(204);
    expect(fetchFn.mock.calls[0][1].method).toBe('DELETE');
    expect(fetchFn.mock.calls[0][1].headers['If-Match']).toBe('"7"');
  });

  it.each([
    ['no token', (r: request.Test) => r.set('If-Match', '"7"'), 401],
    [
      'no If-Match',
      (r: request.Test) => r.set(AGENT_MANAGER_AUTH_HEADER, 't'),
      428,
    ],
    [
      'an unquoted If-Match',
      (r: request.Test) =>
        r.set(AGENT_MANAGER_AUTH_HEADER, 't').set('If-Match', '7'),
      400,
    ],
  ])(
    'refuses a save with %s before calling agent-manager',
    async (_, setup, status) => {
      const fetchFn = mockFetch(() => json(200, {}));
      const res = await setup(
        request(app(fetchFn as unknown as typeof fetch)).post(path),
      ).send({ values: [{ secret: 's', key: 'k', value: SECRET_VALUE }] });
      expect(res.status).toBe(status);
      expect(fetchFn).not.toHaveBeenCalled();
      expect(JSON.stringify(res.body)).not.toContain(SECRET_VALUE);
    },
  );

  it.each([
    [
      'a malformed operation',
      '/organizations/credential-operations/../../info?installation=gazelle',
    ],
    [
      'an operation that is not hex',
      `/organizations/credential-operations/${'z'.repeat(48)}?installation=gazelle`,
    ],
    [
      'an unknown installation',
      `/organizations/credential-operations/${OPERATION}?installation=nowhere`,
    ],
    [
      'an installation without a base domain',
      `/organizations/credential-operations/${OPERATION}?installation=bare`,
    ],
    ['no installation', `/organizations/credential-operations/${OPERATION}`],
  ])('refuses %s', async (_, url) => {
    const fetchFn = mockFetch(() => json(200, {}));
    const res = await request(app(fetchFn as unknown as typeof fetch))
      .get(url)
      .set(AGENT_MANAGER_AUTH_HEADER, 'id-token');
    expect([400, 404]).toContain(res.status);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown fields', { values: [], extra: 1 }],
    [
      'an unknown field in a value',
      { values: [{ secret: 's', key: 'k', value: 'v', name: 'x' }] },
    ],
    ['an empty value', { values: [{ secret: 's', key: 'k', value: '' }] }],
    ['values that are not a list', { values: 'v' }],
  ])('refuses a body with %s', async (_, body) => {
    const fetchFn = mockFetch(() => json(200, {}));
    const res = await request(app(fetchFn as unknown as typeof fetch))
      .post(path)
      .set(AGENT_MANAGER_AUTH_HEADER, 'id-token')
      .set('If-Match', '"7"')
      .send(body);
    expect(res.status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
