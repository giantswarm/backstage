import { RootConfigService } from '@backstage/backend-plugin-api';
import { mockServices } from '@backstage/backend-test-utils';
import { GithubCredentialsProvider } from '@backstage/integration';
import { JsonObject } from '@backstage/types';
import express from 'express';
import request from 'supertest';
import { createRouter } from './router';
import { containerRegistryServiceRef } from '@giantswarm/backstage-plugin-gs-node';
import { mimirServiceRef } from './services/MimirService';

const containerRegistry = {} as unknown as typeof containerRegistryServiceRef.T;
const mimir = {} as unknown as typeof mimirServiceRef.T;
const githubCredentialsProvider = {} as unknown as GithubCredentialsProvider;

function makeConfig(data: JsonObject): RootConfigService {
  return mockServices.rootConfig({ data });
}

async function buildApp(config: RootConfigService) {
  const router = await createRouter({
    config,
    containerRegistry,
    mimir,
    githubCredentialsProvider,
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
 * The Mimir proxy routes.
 *
 * A local app rather than `buildApp`, because these need a real `mimir` stub
 * and an error handler: in production `httpRouter` supplies the latter, so a
 * bare test app would surface an `InputError` as a 500 and hide the difference
 * between "the caller sent a bad request" and "the route broke".
 */
async function buildMimirApp(mimirStub: Partial<typeof mimirServiceRef.T>) {
  const router = await createRouter({
    config: makeConfig({}),
    containerRegistry,
    mimir: mimirStub as unknown as typeof mimirServiceRef.T,
    githubCredentialsProvider,
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
    const app = await buildMimirApp({ queryRange });

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
    const app = await buildMimirApp({ queryRange });

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
      const app = await buildMimirApp({ queryRange });

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
    const app = await buildMimirApp({ queryRange });

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
