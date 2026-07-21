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

describe('GET /installations', () => {
  it('returns the full installations map with all fields', async () => {
    const config = makeConfig({
      gs: {
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
            apiVersionOverrides: {
              clusters: 'v1beta1',
            },
          },
        },
      },
    });

    const app = await buildApp(config);
    const response = await request(app).get('/installations');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      golem: {
        pipeline: 'stable',
        providers: ['capa'],
        authProvider: 'oidc',
        oidcTokenProvider: 'oidc-golem',
        clusterTokenAudience: 'golem',
        backendUrl: 'https://golem.example.com',
        baseDomain: 'golem.example.com',
        region: 'eu-central-1',
        apiVersionOverrides: {
          clusters: 'v1beta1',
        },
      },
    });
  });

  it('omits unset optional fields', async () => {
    const config = makeConfig({
      gs: {
        installations: {
          minimal: {
            pipeline: 'testing',
            authProvider: 'oidc',
          },
        },
      },
    });

    const app = await buildApp(config);
    const response = await request(app).get('/installations');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      minimal: {
        pipeline: 'testing',
        authProvider: 'oidc',
      },
    });
  });

  it('returns an empty object when no installations are configured', async () => {
    const config = makeConfig({ gs: {} });

    const app = await buildApp(config);
    const response = await request(app).get('/installations');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({});
  });
});
