import { RootConfigService } from '@backstage/backend-plugin-api';
import { mockServices } from '@backstage/backend-test-utils';
import { GithubCredentialsProvider } from '@backstage/integration';
import { JsonObject } from '@backstage/types';
import express from 'express';
import request from 'supertest';
import { createRouter } from './router';

// The credential/allowlist behaviour has its own suite
// (githubRawContent.test.ts); here only what the route forwards is under test.
jest.mock('./githubRawContent', () => ({
  ...jest.requireActual('./githubRawContent'),
  fetchGitHubRawContent: jest.fn(),
}));
import { fetchGitHubRawContent } from './githubRawContent';
import { containerRegistryServiceRef } from '@giantswarm/backstage-plugin-gs-node';
import { mimirServiceRef } from './services/MimirService';
import { ManagementClusterVersionsService } from './services/ManagementClusterVersions';

const containerRegistry = {} as unknown as typeof containerRegistryServiceRef.T;
const mimir = {} as unknown as typeof mimirServiceRef.T;
const githubCredentialsProvider = {} as unknown as GithubCredentialsProvider;
const managementClusterVersions = {
  read: jest.fn(async () => ({
    installations: {
      golem: {
        kubernetes: { state: 'known', version: 'v1.35.8' },
        release: { state: 'known', version: '35.1.1' },
      },
    },
    readInBrowser: ['elsewhere'],
  })),
} as unknown as ManagementClusterVersionsService;

function makeConfig(data: JsonObject): RootConfigService {
  return mockServices.rootConfig({ data });
}

async function buildApp(config: RootConfigService) {
  const router = await createRouter({
    config,
    containerRegistry,
    mimir,
    githubCredentialsProvider,
    httpAuth: mockServices.httpAuth(),
    managementClusterVersions,
  });
  const app = express();
  app.use(router);
  return app;
}

describe('GET /config', () => {
  it('serves the signed-in config in app-config shape, without the secrets next to it', async () => {
    const config = makeConfig({
      gs: {
        authProvider: 'oidc-golem',
        adminGroups: ['admins'],
        installations: {
          golem: {
            pipeline: 'stable',
            providers: ['capa'],
            authProvider: 'oidc',
            oidcTokenProvider: 'oidc-golem',
            clusterTokenAudience: 'golem',
            backendUrl: 'https://golem.example.com',
            baseDomain: 'golem.example.com',
            region: 'eu-central-1',
            mimirEnabled: false,
            apiVersionOverrides: {
              clusters: 'v1beta1',
            },
          },
        },
        clusterTokenBroker: {
          tokenUrl: 'https://muster.golem.example.com/oauth/token',
          clientId: 'portal',
          clientSecret: 'hunter2',
        },
      },
      muster: {
        installations: [
          {
            name: 'golem',
            url: 'https://muster.golem.example.com/mcp',
            authProvider: 'mcp-muster',
          },
        ],
      },
    });

    const app = await buildApp(config);
    const response = await request(app).get('/config');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      gs: {
        adminGroups: ['admins'],
        installations: {
          golem: {
            pipeline: 'stable',
            providers: ['capa'],
            authProvider: 'oidc',
            oidcTokenProvider: 'oidc-golem',
            clusterTokenAudience: 'golem',
            backendUrl: 'https://golem.example.com',
            baseDomain: 'golem.example.com',
            region: 'eu-central-1',
            mimirEnabled: false,
            apiVersionOverrides: {
              clusters: 'v1beta1',
            },
          },
        },
        clusterTokenBroker: {
          tokenUrl: 'https://muster.golem.example.com/oauth/token',
        },
      },
      muster: {
        installations: [{ name: 'golem', authProvider: 'mcp-muster' }],
      },
    });
  });

  it('serves an empty object when nothing of the signed-in config is set', async () => {
    const config = makeConfig({ gs: { authProvider: 'oidc-golem' } });

    const app = await buildApp(config);
    const response = await request(app).get('/config');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({});
  });
});

/**
 * The Mimir proxy and versions routes.
 *
 * A local app rather than `buildApp`, because these need a real `mimir` stub
 * or an error handler: in production `httpRouter` supplies the latter, so a
 * bare test app would surface an `InputError` as a 500 and hide the difference
 * between "the caller sent a bad request" and "the route broke".
 */
async function buildAppWithErrors(
  mimirStub: Partial<typeof mimirServiceRef.T>,
) {
  const router = await createRouter({
    config: makeConfig({}),
    containerRegistry,
    mimir: mimirStub as unknown as typeof mimirServiceRef.T,
    githubCredentialsProvider,
    httpAuth: mockServices.httpAuth(),
    managementClusterVersions,
  });
  const app = express();
  app.use(router);
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(err.name === 'InputError' ? 400 : 500).json({
        error: { name: err.name, message: err.message },
      });
    },
  );
  return app;
}

describe('GET /mimir/query_range', () => {
  it('passes the whole window through to the service', async () => {
    const queryRange = jest
      .fn()
      .mockResolvedValue({ status: 'success', data: { result: [] } });
    const app = await buildAppWithErrors({ queryRange });

    const response = await request(app)
      .get('/mimir/query_range')
      .query({
        query: 'sum(increase(cost[1d]))',
        installationName: 'golem',
        start: '1754870400',
        end: '1757462400',
        step: '1d',
      })
      .set('X-Mimir-Token', 'tok');

    expect(response.status).toBe(200);
    expect(queryRange).toHaveBeenCalledWith({
      query: 'sum(increase(cost[1d]))',
      installationName: 'golem',
      start: '1754870400',
      end: '1757462400',
      step: '1d',
      oidcToken: 'tok',
    });
  });

  it('answers 400 without the token header', async () => {
    const queryRange = jest.fn();
    const app = await buildAppWithErrors({ queryRange });

    const response = await request(app).get('/mimir/query_range').query({
      query: 'up',
      installationName: 'golem',
      start: '1',
      end: '2',
      step: '1d',
    });

    // 400, not 500: a missing header is the caller's fault, and
    // `MiddlewareFactory.error()` forwards anything >= 500 to Sentry.
    expect(response.status).toBe(400);
    expect(queryRange).not.toHaveBeenCalled();
  });

  it.each(['start', 'end', 'step'])(
    'answers 400 when %s is missing',
    async missing => {
      const queryRange = jest.fn();
      const app = await buildAppWithErrors({ queryRange });

      const params: Record<string, string> = {
        query: 'up',
        installationName: 'golem',
        start: '1',
        end: '2',
        step: '1d',
      };
      delete params[missing];

      const response = await request(app)
        .get('/mimir/query_range')
        .query(params)
        .set('X-Mimir-Token', 'tok');

      expect(response.status).toBe(400);
      expect(queryRange).not.toHaveBeenCalled();
    },
  );

  it('surfaces the service error for an opted-out installation', async () => {
    const queryRange = jest.fn().mockRejectedValue(
      Object.assign(new Error('Mimir is not enabled'), {
        name: 'NotFoundError',
      }),
    );
    const app = await buildAppWithErrors({ queryRange });

    const response = await request(app)
      .get('/mimir/query_range')
      .query({
        query: 'up',
        installationName: 'golem',
        start: '1',
        end: '2',
        step: '1d',
      })
      .set('X-Mimir-Token', 'tok');

    expect(response.body.error.name).toBe('NotFoundError');
  });
});

describe('GET /installations/versions', () => {
  it('serves the management cluster versions read with the forwarded main session', async () => {
    const app = await buildApp(makeConfig({}));

    const response = await request(app)
      .get('/installations/versions')
      .set('gs-subject-token', 'subject');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.installations.golem.release).toEqual({
      state: 'known',
      version: '35.1.1',
    });
    expect(response.body.readInBrowser).toEqual(['elsewhere']);
    expect(managementClusterVersions.read).toHaveBeenCalledWith(
      expect.objectContaining({ principal: expect.anything() }),
      'subject',
    );
  });

  it('refuses a request without the main session', async () => {
    const app = await buildAppWithErrors({});

    const response = await request(app).get('/installations/versions');

    expect(response.status).toBe(400);
  });
});

describe('GET /github/raw-content', () => {
  const fetchGitHubRawContentMock = fetchGitHubRawContent as jest.Mock;

  beforeEach(() => {
    fetchGitHubRawContentMock.mockReset();
    fetchGitHubRawContentMock.mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/plain' },
      text: async () => 'file content',
    });
  });

  it('rejects URLs outside raw.githubusercontent.com', async () => {
    const app = await buildAppWithErrors({});

    const response = await request(app)
      .get('/github/raw-content')
      .query({ url: 'https://example.com/giantswarm/repo/main/file' });

    expect(response.status).toBe(400);
    expect(fetchGitHubRawContentMock).not.toHaveBeenCalled();
  });

  it('proxies the content through the shared credentials provider', async () => {
    const app = await buildApp(makeConfig({}));

    const url =
      'https://raw.githubusercontent.com/giantswarm/repo/main/values.yaml';
    const response = await request(app).get('/github/raw-content').query({
      url,
    });

    expect(response.status).toBe(200);
    expect(response.text).toBe('file content');
    // The owner allowlist (gs.github.allowedOwners) is enforced inside the
    // provider the plugin wires up, not per route — see
    // githubCredentials.test.ts.
    expect(fetchGitHubRawContentMock).toHaveBeenCalledWith(
      url,
      githubCredentialsProvider,
    );
  });

  it('passes upstream failures through as the upstream status', async () => {
    fetchGitHubRawContentMock.mockResolvedValue({
      ok: false,
      status: 404,
    });
    const app = await buildApp(makeConfig({}));

    const response = await request(app).get('/github/raw-content').query({
      url: 'https://raw.githubusercontent.com/giantswarm/repo/main/nope',
    });

    expect(response.status).toBe(404);
    expect(response.body.error.message).toMatch(/HTTP 404/);
  });
});
