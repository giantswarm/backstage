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
  const getVersion = jest.fn();
  const getMe = jest.fn();

  const mockClient = {
    listSessions,
    getVersion,
    getMe,
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
    getVersion.mockReset();
    getMe.mockReset();
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
      const response = await request(await buildUnconfiguredApp())
        .get('/kagent/sessions')
        .query({ installation: 'gazelle' })
        .set(KAGENT_AUTH_HEADER, 'user-token');

      expect(response.status).toBe(503);
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

  describe('GET /kagent/version', () => {
    it('works without a user token', async () => {
      getVersion.mockResolvedValue({ kagent_version: '0.9.9' });

      const response = await request(app)
        .get('/kagent/version')
        .query({ installation: 'gazelle' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ kagent_version: '0.9.9' });
      expect(getVersion).toHaveBeenCalledWith({ userToken: undefined });
    });

    it('forwards the token when one is present', async () => {
      getVersion.mockResolvedValue({ kagent_version: '0.9.9' });

      await request(app)
        .get('/kagent/version')
        .query({ installation: 'gazelle' })
        .set(KAGENT_AUTH_HEADER, 'user-token');

      expect(getVersion).toHaveBeenCalledWith({ userToken: 'user-token' });
    });
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
