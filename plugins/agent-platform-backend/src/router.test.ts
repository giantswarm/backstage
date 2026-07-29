import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { mockServices } from '@backstage/backend-test-utils';
import express from 'express';
import request from 'supertest';
import { KAGENT_AUTH_HEADER, KagentClient } from './KagentClient';
import { createRouter, RouterOptions } from './router';

/** Two installations with base domains, as gs.installations would provide. */
const twoInstallations = {
  gs: {
    installations: {
      gazelle: { baseDomain: 'gazelle.example.io' },
      golem: { baseDomain: 'golem.example.io' },
    },
  },
};

describe('createRouter', () => {
  const listSessions = jest.fn();
  const getMe = jest.fn();
  const getSession = jest.fn();
  const listSessionTasks = jest.fn();

  const mockClient = {
    listSessions,
    getMe,
    getSession,
    listSessionTasks,
  } as unknown as KagentClient;

  // Mirror the production setup: the backend's root HTTP router applies
  // MiddlewareFactory.error() after plugin routes, mapping @backstage/errors
  // classes to status codes.
  async function buildApp(
    data: object = twoInstallations,
    options: Partial<RouterOptions> = {},
  ) {
    const logger = mockServices.logger.mock();
    const config = mockServices.rootConfig({ data });
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

  let app: express.Express;

  beforeEach(async () => {
    listSessions.mockReset();
    getMe.mockReset();
    getSession.mockReset();
    listSessionTasks.mockReset();
    app = await buildApp();
  });

  it('reports health with the number of configured installations', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', configured: 2 });
  });

  it('lists installations by name only, sorted', async () => {
    const response = await request(app).get('/kagent/installations');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      installations: [{ name: 'gazelle' }, { name: 'golem' }],
    });
  });

  it('never exposes installation URLs to the frontend', async () => {
    const response = await request(app).get('/kagent/installations');

    // baseDomain deanonymizes customers, so the derived URL must stay
    // backend-only.
    for (const installation of response.body.installations) {
      expect(Object.keys(installation)).toEqual(['name']);
    }
    expect(JSON.stringify(response.body)).not.toContain('example.io');
  });

  describe('when nothing is configured', () => {
    // No injected client here: the router synthesizes a routable installation
    // when one is injected, which would mask the unconfigured path entirely.
    async function buildUnconfiguredApp() {
      const logger = mockServices.logger.mock();
      const config = mockServices.rootConfig({ data: {} });
      const router = await createRouter({ logger, config });
      const unconfigured = express();
      unconfigured.use(router);
      unconfigured.use(MiddlewareFactory.create({ logger, config }).error());
      return unconfigured;
    }

    it('reports zero configured installations', async () => {
      const response = await request(await buildUnconfiguredApp()).get(
        '/health',
      );

      expect(response.body).toEqual({ status: 'ok', configured: 0 });
    });

    it('returns an empty installations list', async () => {
      const response = await request(await buildUnconfiguredApp()).get(
        '/kagent/installations',
      );

      expect(response.body).toEqual({ installations: [] });
    });

    it('returns 503 for reads', async () => {
      // Nothing configured at all is a real misconfiguration, so a 5xx (and the
      // Sentry event that follows) is wanted here — unlike the per-installation
      // "kagent isn't deployed" case below.
      const response = await request(await buildUnconfiguredApp())
        .get('/kagent/sessions')
        .query({ installation: 'gazelle' })
        .set(KAGENT_AUTH_HEADER, 'user-token');

      expect(response.status).toBe(503);
    });
  });

  describe('Sentry noise', () => {
    // MiddlewareFactory.error() logs at `error` for any status >= 500, and the
    // root logger forwards warn/error to Sentry. So the expected outcome on a
    // fleet — most installations simply not running kagent — must never come back
    // as a 5xx, or every page view raises an event per kagent-less installation.
    it('reports an unreachable kagent as 404, not a 5xx', async () => {
      const notFound = new Error(
        'The kagent API is not available for installation gazelle.',
      );
      notFound.name = 'NotFoundError';
      listSessions.mockRejectedValue(notFound);

      const response = await request(app)
        .get('/kagent/sessions')
        .query({ installation: 'gazelle' })
        .set(KAGENT_AUTH_HEADER, 'user-token');

      expect(response.status).toBe(404);
      expect(response.status).toBeLessThan(500);
    });

    it('still reports a degraded kagent as a 5xx', async () => {
      // The counterpart: deployed-but-unwell is rare and actionable, so it should
      // reach Sentry.
      const upstream = new Error('kagent returned status 500');
      upstream.name = 'UpstreamError';
      listSessions.mockRejectedValue(upstream);

      const response = await request(app)
        .get('/kagent/sessions')
        .query({ installation: 'gazelle' })
        .set(KAGENT_AUTH_HEADER, 'user-token');

      expect(response.status).toBeGreaterThanOrEqual(500);
    });
  });

  describe('GET /kagent/sessions', () => {
    it('requires the installation query parameter', async () => {
      const response = await request(app)
        .get('/kagent/sessions')
        .set(KAGENT_AUTH_HEADER, 'user-token');

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('installation');
      expect(listSessions).not.toHaveBeenCalled();
    });

    it('rejects an unknown installation and names the configured ones', async () => {
      const response = await request(app)
        .get('/kagent/sessions')
        .query({ installation: 'nope' })
        .set(KAGENT_AUTH_HEADER, 'user-token');

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('nope');
      expect(response.body.error.message).toContain('gazelle');
      expect(listSessions).not.toHaveBeenCalled();
    });

    it('rejects a repeated installation parameter', async () => {
      const response = await request(app)
        .get('/kagent/sessions?installation=gazelle&installation=golem')
        .set(KAGENT_AUTH_HEADER, 'user-token');

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('at most once');
    });

    it('requires a forwarded user token', async () => {
      const response = await request(app)
        .get('/kagent/sessions')
        .query({ installation: 'gazelle' });

      expect(response.status).toBe(401);
      expect(listSessions).not.toHaveBeenCalled();
    });

    it('forwards the user token and echoes kagent’s body verbatim', async () => {
      // The full envelope plus an unknown field: the proxy must not unwrap,
      // reshape or strip anything.
      const body = {
        error: false,
        data: [
          {
            id: 'abc',
            name: 'What issues are assi...',
            user_id: 'marian@giantswarm.io',
            created_at: '2026-07-23T16:04:28.586641Z',
            updated_at: '2026-07-23T16:09:58.162014Z',
            agent_id: 'kagent__NS__issue_tracker',
            some_future_field: 'kept',
          },
        ],
        message: 'Successfully listed sessions',
      };
      listSessions.mockResolvedValue(body);

      const response = await request(app)
        .get('/kagent/sessions')
        .query({ installation: 'gazelle' })
        .set(KAGENT_AUTH_HEADER, 'user-token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(body);
      expect(listSessions).toHaveBeenCalledWith({ userToken: 'user-token' });
    });

    it('routes to the requested installation', async () => {
      listSessions.mockResolvedValue({ error: false, data: [] });

      await request(app)
        .get('/kagent/sessions')
        .query({ installation: 'golem' })
        .set(KAGENT_AUTH_HEADER, 'user-token');

      expect(listSessions).toHaveBeenCalledTimes(1);
    });

    it('passes through an empty response that omits the data key', async () => {
      // kagent's Go `omitempty` drops a zero-length slice entirely.
      const body = { error: false, message: 'Successfully listed sessions' };
      listSessions.mockResolvedValue(body);

      const response = await request(app)
        .get('/kagent/sessions')
        .query({ installation: 'gazelle' })
        .set(KAGENT_AUTH_HEADER, 'user-token');

      expect(response.body).toEqual(body);
      expect(response.body.data).toBeUndefined();
    });
  });

  describe('GET /kagent/sessions/:sessionId', () => {
    const sessionBody = {
      error: false,
      data: {
        session: {
          id: 'abc',
          name: 'What issues are assi...',
          user_id: 'marian@giantswarm.io',
          created_at: '2026-07-23T16:04:28.586641Z',
          updated_at: '2026-07-23T16:09:58.162014Z',
          agent_id: 'kagent__NS__issue_tracker',
        },
        events: [
          {
            id: 'e1',
            session_id: 'abc',
            created_at: '2026-07-23T16:04:29Z',
            data: '{"kind":"message","messageId":"m1","role":"user","parts":[]}',
          },
        ],
        some_future_field: 'kept',
      },
      message: 'Successfully retrieved session',
    };

    it('does not shadow the list route', async () => {
      listSessions.mockResolvedValue({ error: false, data: [] });

      await request(app)
        .get('/kagent/sessions')
        .query({ installation: 'gazelle' })
        .set(KAGENT_AUTH_HEADER, 'user-token');

      expect(listSessions).toHaveBeenCalledTimes(1);
      expect(getSession).not.toHaveBeenCalled();
    });

    it('forwards the id and token and echoes the body verbatim', async () => {
      getSession.mockResolvedValue(sessionBody);

      const response = await request(app)
        .get('/kagent/sessions/abc')
        .query({ installation: 'gazelle' })
        .set(KAGENT_AUTH_HEADER, 'user-token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(sessionBody);
      expect(getSession).toHaveBeenCalledWith('abc', {
        userToken: 'user-token',
      });
    });

    it('leaves the list route to handle a trailing slash', async () => {
      // `:sessionId` cannot match an empty segment, so `/kagent/sessions/` reaches
      // the list route. Pinned because the detail handler's id helper is written
      // as a typing shim on that basis — it has no empty-id branch.
      listSessions.mockResolvedValue({ error: false, data: [] });

      const response = await request(app)
        .get('/kagent/sessions/')
        .query({ installation: 'gazelle' })
        .set(KAGENT_AUTH_HEADER, 'user-token');

      expect(response.status).toBe(200);
      expect(listSessions).toHaveBeenCalledTimes(1);
      expect(getSession).not.toHaveBeenCalled();
    });

    it('does not trim an id, so the id sent upstream is the id received', async () => {
      // Trimming is a format assumption about a value documented as opaque. If
      // kagent ever issues an id with surrounding whitespace, trimming it here
      // would send a *different* id upstream and 404 in a way that looks exactly
      // like a missing session.
      getSession.mockResolvedValue(sessionBody);

      await request(app)
        .get('/kagent/sessions/%20abc%20')
        .query({ installation: 'gazelle' })
        .set(KAGENT_AUTH_HEADER, 'user-token');

      expect(getSession).toHaveBeenCalledWith(' abc ', {
        userToken: 'user-token',
      });
    });

    it('passes an id through decoded, whatever shape it has', async () => {
      // Both 64-char hex and UUIDs occur in real responses, so the router must not
      // validate a format — only that a segment is present.
      getSession.mockResolvedValue(sessionBody);

      await request(app)
        .get('/kagent/sessions/019f8a13-c6c2-73af-a1d9-ab0abeeb6734')
        .query({ installation: 'gazelle' })
        .set(KAGENT_AUTH_HEADER, 'user-token');

      expect(getSession).toHaveBeenCalledWith(
        '019f8a13-c6c2-73af-a1d9-ab0abeeb6734',
        { userToken: 'user-token' },
      );
    });

    it('requires the installation query parameter', async () => {
      const response = await request(app)
        .get('/kagent/sessions/abc')
        .set(KAGENT_AUTH_HEADER, 'user-token');

      expect(response.status).toBe(400);
      expect(getSession).not.toHaveBeenCalled();
    });

    it('requires a forwarded user token', async () => {
      const response = await request(app)
        .get('/kagent/sessions/abc')
        .query({ installation: 'gazelle' });

      expect(response.status).toBe(401);
      expect(getSession).not.toHaveBeenCalled();
    });

    it('rejects an unknown installation', async () => {
      const response = await request(app)
        .get('/kagent/sessions/abc')
        .query({ installation: 'nope' })
        .set(KAGENT_AUTH_HEADER, 'user-token');

      expect(response.status).toBe(400);
      expect(getSession).not.toHaveBeenCalled();
    });

    it('reports someone else’s or a deleted session as 404, not a 5xx', async () => {
      // kagent scopes the lookup by user id, so "not yours" and "gone" are the
      // same 404. Both are expected outcomes for a stale deep link, and anything
      // >= 500 would be logged at error and forwarded to Sentry.
      const notFound = new Error('Session not found');
      notFound.name = 'NotFoundError';
      getSession.mockRejectedValue(notFound);

      const response = await request(app)
        .get('/kagent/sessions/abc')
        .query({ installation: 'gazelle' })
        .set(KAGENT_AUTH_HEADER, 'user-token');

      expect(response.status).toBe(404);
      expect(response.status).toBeLessThan(500);
    });

    it('still reports a degraded kagent as a 5xx', async () => {
      const upstream = new Error('kagent returned status 500');
      upstream.name = 'UpstreamError';
      getSession.mockRejectedValue(upstream);

      const response = await request(app)
        .get('/kagent/sessions/abc')
        .query({ installation: 'gazelle' })
        .set(KAGENT_AUTH_HEADER, 'user-token');

      expect(response.status).toBeGreaterThanOrEqual(500);
    });
  });

  describe('GET /kagent/sessions/:sessionId/tasks', () => {
    const tasksBody = {
      error: false,
      data: [
        {
          id: 'task-1',
          contextId: 'abc',
          kind: 'task',
          status: { state: 'completed', timestamp: '2026-07-23T16:09:58Z' },
          history: [
            {
              kind: 'message',
              messageId: 'm1',
              role: 'user',
              parts: [{ kind: 'text', text: 'hello' }],
            },
          ],
          some_future_field: 'kept',
        },
      ],
      message: 'Successfully retrieved session tasks',
    };

    it('forwards the id and token and echoes the body verbatim', async () => {
      listSessionTasks.mockResolvedValue(tasksBody);

      const response = await request(app)
        .get('/kagent/sessions/abc/tasks')
        .query({ installation: 'gazelle' })
        .set(KAGENT_AUTH_HEADER, 'user-token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(tasksBody);
      expect(listSessionTasks).toHaveBeenCalledWith('abc', {
        userToken: 'user-token',
      });
      expect(getSession).not.toHaveBeenCalled();
    });

    it('requires the installation query parameter', async () => {
      const response = await request(app)
        .get('/kagent/sessions/abc/tasks')
        .set(KAGENT_AUTH_HEADER, 'user-token');

      expect(response.status).toBe(400);
      expect(listSessionTasks).not.toHaveBeenCalled();
    });

    it('requires a forwarded user token', async () => {
      const response = await request(app)
        .get('/kagent/sessions/abc/tasks')
        .query({ installation: 'gazelle' });

      expect(response.status).toBe(401);
      expect(listSessionTasks).not.toHaveBeenCalled();
    });

    it('reports a session with no tasks as an empty list, not an error', async () => {
      // Go's `omitempty` drops a zero-length slice, so an untouched session comes
      // back with no `data` key at all.
      const body = {
        error: false,
        message: 'Successfully retrieved session tasks',
      };
      listSessionTasks.mockResolvedValue(body);

      const response = await request(app)
        .get('/kagent/sessions/abc/tasks')
        .query({ installation: 'gazelle' })
        .set(KAGENT_AUTH_HEADER, 'user-token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(body);
    });

    it('reports an unreadable session as 404, not a 5xx', async () => {
      const notFound = new Error('Session not found for given ID');
      notFound.name = 'NotFoundError';
      listSessionTasks.mockRejectedValue(notFound);

      const response = await request(app)
        .get('/kagent/sessions/abc/tasks')
        .query({ installation: 'gazelle' })
        .set(KAGENT_AUTH_HEADER, 'user-token');

      expect(response.status).toBe(404);
    });
  });

  it('exposes no version route', async () => {
    // kagent's /version lives at the server root, which neither supported door
    // proxies to the controller, so a probe would fail on every healthy
    // installation. Asserted so the route is not reintroduced casually.
    const response = await request(app)
      .get('/kagent/version')
      .query({ installation: 'gazelle' });

    expect(response.status).toBe(404);
  });

  describe('GET /kagent/me', () => {
    it('works without a user token and echoes the body', async () => {
      getMe.mockResolvedValue({ sub: 'marian@giantswarm.io' });

      const response = await request(app)
        .get('/kagent/me')
        .query({ installation: 'gazelle' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ sub: 'marian@giantswarm.io' });
      expect(getMe).toHaveBeenCalledWith({ userToken: undefined });
    });
  });

  describe('with an explicit installations allowlist', () => {
    it('restricts the fan-out to the listed installations', async () => {
      const restricted = await buildApp({
        ...twoInstallations,
        agentPlatform: { kagent: { installations: { gazelle: {} } } },
      });

      const response = await request(restricted).get('/kagent/installations');

      expect(response.body).toEqual({ installations: [{ name: 'gazelle' }] });
    });
  });
});
