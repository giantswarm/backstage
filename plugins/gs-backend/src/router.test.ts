import { RootConfigService } from '@backstage/backend-plugin-api';
import { mockServices } from '@backstage/backend-test-utils';
import { GithubCredentialsProvider } from '@backstage/integration';
import { JsonObject } from '@backstage/types';
import express from 'express';
import request from 'supertest';
import { createRouter } from './router';
import { createSkillPullRequest } from './agentSkills/createSkillPullRequest';

// The route's own validation is under test; the GitHub conversation has its
// own suite (createSkillPullRequest.test.ts).
jest.mock('./agentSkills/createSkillPullRequest', () => ({
  ...jest.requireActual('./agentSkills/createSkillPullRequest'),
  createSkillPullRequest: jest.fn(),
}));
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

describe('POST /agent-skills/pull-request', () => {
  const opened = {
    pullRequestUrl: 'https://github.com/giantswarm/skills/pull/7',
    number: 7,
    branch: 'add-skill/notes',
    base: 'main',
    path: 'notes/SKILL.md',
  };

  /** An app with the skill repositories configured and the error handler on. */
  async function buildSkillsApp() {
    const router = await createRouter({
      config: makeConfig({
        agentPlatform: {
          skills: {
            repositories: ['https://github.com/giantswarm/skills'],
          },
        },
      }),
      containerRegistry,
      mimir,
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

  const body = {
    repoUrl: 'https://github.com/giantswarm/skills',
    skillName: 'notes',
    description: 'How to take notes.',
    instructions: 'Write things down.',
  };

  beforeEach(() => {
    jest.mocked(createSkillPullRequest).mockReset();
    jest.mocked(createSkillPullRequest).mockResolvedValue(opened);
  });

  it('opens the pull request with the person’s own GitHub token', async () => {
    const app = await buildSkillsApp();

    const response = await request(app)
      .post('/agent-skills/pull-request')
      .set('gs-github-token', 'gh-token')
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(opened);
    expect(createSkillPullRequest).toHaveBeenCalledWith({
      ...body,
      token: 'gh-token',
    });
  });

  it('refuses with 401 and says why when the GitHub grant token is missing', async () => {
    const app = await buildSkillsApp();

    const response = await request(app)
      .post('/agent-skills/pull-request')
      .send(body);

    expect(response.status).toBe(401);
    expect(response.body.error.message).toContain('gs-github-token');
    expect(response.body.error.message).toContain('Connect GitHub');
    expect(createSkillPullRequest).not.toHaveBeenCalled();
  });

  it('refuses a repository that is not a configured skill source', async () => {
    const app = await buildSkillsApp();

    const response = await request(app)
      .post('/agent-skills/pull-request')
      .set('gs-github-token', 'gh-token')
      .send({ ...body, repoUrl: 'https://github.com/evil/repo' });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain(
      'not one of the configured skill repositories',
    );
    expect(createSkillPullRequest).not.toHaveBeenCalled();
  });

  it('accepts the configured repository written another way', async () => {
    const app = await buildSkillsApp();

    const response = await request(app)
      .post('/agent-skills/pull-request')
      .set('gs-github-token', 'gh-token')
      .send({ ...body, repoUrl: 'https://github.com/GiantSwarm/Skills.git' });

    expect(response.status).toBe(200);
  });

  it('refuses a skill name that is not a slug', async () => {
    const app = await buildSkillsApp();

    const response = await request(app)
      .post('/agent-skills/pull-request')
      .set('gs-github-token', 'gh-token')
      .send({ ...body, skillName: '../escape' });

    expect(response.status).toBe(400);
    expect(createSkillPullRequest).not.toHaveBeenCalled();
  });

  it("forwards GitHub's refusal with its upstream status", async () => {
    const { GitHubApiError } = jest.requireActual(
      './agentSkills/discoverAgentSkills',
    );
    jest
      .mocked(createSkillPullRequest)
      .mockRejectedValue(
        new GitHubApiError(
          409,
          'A skill named notes already exists in giantswarm/skills.',
        ),
      );
    const app = await buildSkillsApp();

    const response = await request(app)
      .post('/agent-skills/pull-request')
      .set('gs-github-token', 'gh-token')
      .send(body);

    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe(
      'Failed to open the pull request: A skill named notes already exists in giantswarm/skills.',
    );
  });
});
