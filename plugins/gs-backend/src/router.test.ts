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
// Likewise for discovery: which provider the route picks and what it forwards
// is under test here; each provider has its own suite.
jest.mock('./agentSkills/discoverAgentSkills', () => ({
  ...jest.requireActual('./agentSkills/discoverAgentSkills'),
  discoverAgentSkills: jest.fn(),
}));
jest.mock('./agentSkills/discoverAgentSkillsFromGit', () => ({
  ...jest.requireActual('./agentSkills/discoverAgentSkillsFromGit'),
  discoverAgentSkillsFromGit: jest.fn(),
}));
jest.mock('./agentSkills/readSkillContent', () => ({
  ...jest.requireActual('./agentSkills/readSkillContent'),
  readSkillContentFromGitHub: jest.fn(),
  readSkillContentFromGit: jest.fn(),
}));
import {
  discoverAgentSkills,
  GitHubApiError,
} from './agentSkills/discoverAgentSkills';
import {
  readSkillContentFromGit,
  readSkillContentFromGitHub,
} from './agentSkills/readSkillContent';
import {
  discoverAgentSkillsFromGit,
  GitFetchError,
} from './agentSkills/discoverAgentSkillsFromGit';
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

describe('GET /agent-skills', () => {
  const COMMIT = 'cb1fb768ba1d1b1e62c6e0b32c39a6b4bd3b58a1';
  const listing = {
    skills: [
      {
        name: 'notes',
        description: 'How to take notes.',
        repoUrl: 'https://github.com/giantswarm/other-skills',
        path: 'notes',
        ref: 'main',
        commit: COMMIT,
        contentReadable: true,
      },
    ],
    ref: 'main',
    commit: COMMIT,
    truncated: false,
  };
  const discovered = {
    ...listing,
    contents: new Map([['notes', '---\nname: notes\n---\nWrite it down.']]),
  };
  /** What the route answers: the listing, when it was read, not the files. */
  const answered = {
    ...listing,
    readAt: expect.any(String),
    stale: false,
  };

  /** An app with a GitHub and a lab-local git skill source configured. */
  async function buildDiscoveryApp() {
    const router = await createRouter({
      config: makeConfig({
        agentPlatform: {
          skills: {
            repositories: [
              'https://github.com/giantswarm/skills',
              'http://gitserver.agent-platform.svc.cluster.local/skills.git',
            ],
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

  beforeEach(() => {
    jest.mocked(discoverAgentSkills).mockReset().mockResolvedValue(discovered);
    jest
      .mocked(discoverAgentSkillsFromGit)
      .mockReset()
      .mockResolvedValue(discovered);
  });

  it('sends a github.com repository through the GitHub API provider', async () => {
    const app = await buildDiscoveryApp();

    const response = await request(app)
      .get('/agent-skills')
      .query({ repoUrl: 'https://github.com/giantswarm/other-skills' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(answered);
    expect(discoverAgentSkills).toHaveBeenCalledWith(
      expect.objectContaining({
        repoUrl: 'https://github.com/giantswarm/other-skills',
      }),
    );
    expect(discoverAgentSkillsFromGit).not.toHaveBeenCalled();
  });

  it('sends a configured non-GitHub repository through the git provider', async () => {
    const app = await buildDiscoveryApp();

    const response = await request(app).get('/agent-skills').query({
      repoUrl: 'http://gitserver.agent-platform.svc.cluster.local/skills.git',
      ref: 'main',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(answered);
    expect(discoverAgentSkillsFromGit).toHaveBeenCalledWith({
      repoUrl: 'http://gitserver.agent-platform.svc.cluster.local/skills.git',
      ref: 'main',
    });
    expect(discoverAgentSkills).not.toHaveBeenCalled();
  });

  it('accepts the configured non-GitHub repository written another way', async () => {
    const app = await buildDiscoveryApp();

    const response = await request(app).get('/agent-skills').query({
      repoUrl: 'http://gitserver.agent-platform.svc.cluster.local/skills/',
    });

    expect(response.status).toBe(200);
    expect(discoverAgentSkillsFromGit).toHaveBeenCalled();
  });

  it('refuses a non-GitHub repository that is not configured (no ad-hoc clones)', async () => {
    const app = await buildDiscoveryApp();

    const response = await request(app)
      .get('/agent-skills')
      .query({ repoUrl: 'http://169.254.169.254/latest/meta-data' });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain(
      'not one of the configured skill repositories',
    );
    expect(discoverAgentSkillsFromGit).not.toHaveBeenCalled();
  });

  it('refuses a non-http(s) URL', async () => {
    const app = await buildDiscoveryApp();

    const response = await request(app)
      .get('/agent-skills')
      .query({ repoUrl: 'ftp://example.com/skills' });

    expect(response.status).toBe(400);
    expect(discoverAgentSkills).not.toHaveBeenCalled();
    expect(discoverAgentSkillsFromGit).not.toHaveBeenCalled();
  });

  it('answers a repeated listing from memory, not from GitHub', async () => {
    const app = await buildDiscoveryApp();
    const query = { repoUrl: 'https://github.com/giantswarm/skills' };

    await request(app).get('/agent-skills').query(query);
    const again = await request(app).get('/agent-skills').query(query);

    expect(again.status).toBe(200);
    expect(again.body).toEqual(answered);
    expect(discoverAgentSkills).toHaveBeenCalledTimes(1);
  });

  it('serves the last listing, marked stale, when GitHub refuses with a rate limit', async () => {
    const start = Date.UTC(2026, 9, 10, 12, 0);
    const clock = jest.spyOn(Date, 'now').mockReturnValue(start);
    try {
      const app = await buildDiscoveryApp();
      const query = { repoUrl: 'https://github.com/giantswarm/skills' };
      await request(app).get('/agent-skills').query(query);

      clock.mockReturnValue(start + 60 * 60 * 1000);
      jest
        .mocked(discoverAgentSkills)
        .mockRejectedValue(
          new GitHubApiError(403, 'rate limit used up', { retryAt: undefined }),
        );
      const response = await request(app).get('/agent-skills').query(query);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        ...listing,
        readAt: new Date(start).toISOString(),
        stale: true,
      });
      // The revalidation was handed what it can reuse.
      expect(jest.mocked(discoverAgentSkills).mock.calls[1][0]).toEqual(
        expect.objectContaining({
          previous: expect.objectContaining({ commit: COMMIT }),
        }),
      );
    } finally {
      clock.mockRestore();
    }
  });

  it("forwards the git provider's refusal with its upstream status", async () => {
    jest
      .mocked(discoverAgentSkillsFromGit)
      .mockRejectedValue(
        new GitFetchError(502, 'Could not fetch the repository over git'),
      );
    const app = await buildDiscoveryApp();

    const response = await request(app).get('/agent-skills').query({
      repoUrl: 'http://gitserver.agent-platform.svc.cluster.local/skills.git',
    });

    expect(response.status).toBe(502);
    expect(response.body.error.message).toBe(
      'Failed to discover skills: Could not fetch the repository over git',
    );
  });
});

describe('GET /agent-skills/content', () => {
  const COMMIT = 'cb1fb768ba1d1b1e62c6e0b32c39a6b4bd3b58a1';
  const GIT_REPO =
    'http://gitserver.agent-platform.svc.cluster.local/skills.git';
  const content = {
    repoUrl: 'https://github.com/giantswarm/skills',
    path: 'notes',
    commit: COMMIT,
    name: 'notes',
    description: 'How to take notes.',
    instructions: 'Write things down.',
  };

  async function buildContentApp() {
    const router = await createRouter({
      config: makeConfig({
        agentPlatform: {
          skills: {
            repositories: ['https://github.com/giantswarm/skills', GIT_REPO],
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

  beforeEach(() => {
    jest
      .mocked(readSkillContentFromGitHub)
      .mockReset()
      .mockResolvedValue(content);
    jest.mocked(readSkillContentFromGit).mockReset().mockResolvedValue(content);
  });

  it('reads a configured github.com skill through the GitHub provider', async () => {
    const app = await buildContentApp();

    const response = await request(app).get('/agent-skills/content').query({
      repoUrl: 'https://github.com/GiantSwarm/skills.git',
      path: 'notes',
      commit: COMMIT,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(content);
    expect(readSkillContentFromGitHub).toHaveBeenCalledWith({
      repoUrl: 'https://github.com/GiantSwarm/skills.git',
      path: 'notes',
      commit: COMMIT,
      githubCredentialsProvider,
    });
    expect(readSkillContentFromGit).not.toHaveBeenCalled();
  });

  it('reads a configured non-GitHub skill through the git provider, root path by default', async () => {
    const app = await buildContentApp();

    const response = await request(app)
      .get('/agent-skills/content')
      .query({ repoUrl: GIT_REPO, commit: COMMIT, ref: 'main' });

    expect(response.status).toBe(200);
    expect(readSkillContentFromGit).toHaveBeenCalledWith({
      repoUrl: GIT_REPO,
      path: '',
      commit: COMMIT,
      ref: 'main',
    });
  });

  it.each([
    [
      'an unconfigured github.com repository',
      { repoUrl: 'https://github.com/evil/repo', commit: COMMIT },
    ],
    [
      'an unconfigured git host',
      { repoUrl: 'http://169.254.169.254/latest', commit: COMMIT },
    ],
    [
      'a path leaving the repository',
      {
        repoUrl: 'https://github.com/giantswarm/skills',
        path: '../etc',
        commit: COMMIT,
      },
    ],
    [
      'a ref instead of a commit',
      { repoUrl: 'https://github.com/giantswarm/skills', commit: 'main' },
    ],
  ])('refuses %s', async (_, query) => {
    const app = await buildContentApp();

    const response = await request(app)
      .get('/agent-skills/content')
      .query(query);

    expect(response.status).toBe(400);
    expect(readSkillContentFromGitHub).not.toHaveBeenCalled();
    expect(readSkillContentFromGit).not.toHaveBeenCalled();
  });

  it('answers a SKILL.md the listing already read from memory, without reading it again', async () => {
    jest
      .mocked(discoverAgentSkills)
      .mockReset()
      .mockResolvedValue({
        skills: [
          {
            name: 'notes',
            description: 'How to take notes.',
            repoUrl: 'https://github.com/giantswarm/skills',
            path: 'notes',
            ref: 'main',
            commit: COMMIT,
            contentReadable: true,
          },
        ],
        ref: 'main',
        commit: COMMIT,
        truncated: false,
        contents: new Map([
          [
            'notes',
            '---\nname: notes\ndescription: How to take notes.\n---\n\nWrite things down.\n',
          ],
        ]),
      });
    const app = await buildContentApp();
    await request(app)
      .get('/agent-skills')
      .query({ repoUrl: 'https://github.com/giantswarm/skills' });

    const response = await request(app).get('/agent-skills/content').query({
      repoUrl: 'https://github.com/GiantSwarm/skills.git',
      path: 'notes',
      commit: COMMIT,
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(content);
    expect(readSkillContentFromGitHub).not.toHaveBeenCalled();
  });

  it("forwards a provider's refusal with its upstream status", async () => {
    jest
      .mocked(readSkillContentFromGit)
      .mockRejectedValue(
        new GitFetchError(409, 'main has moved on; reload the skill.'),
      );
    const app = await buildContentApp();

    const response = await request(app)
      .get('/agent-skills/content')
      .query({ repoUrl: GIT_REPO, commit: COMMIT });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe(
      'Failed to read the skill: main has moved on; reload the skill.',
    );
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

  it('passes an update through with the skill directory and base commit', async () => {
    const app = await buildSkillsApp();
    const update = {
      ...body,
      kind: 'update',
      path: 'plugins/notes',
      baseCommit: 'c'.repeat(40),
    };

    const response = await request(app)
      .post('/agent-skills/pull-request')
      .set('gs-github-token', 'gh-token')
      .send(update);

    expect(response.status).toBe(200);
    expect(createSkillPullRequest).toHaveBeenCalledWith({
      ...update,
      token: 'gh-token',
    });
  });

  it.each([
    ['without the skill directory', { kind: 'update' }],
    ['with a path leaving the repository', { kind: 'update', path: '../x' }],
    ['with an unknown kind', { kind: 'delete', path: 'notes' }],
    [
      'without the commit the edit started from',
      { kind: 'update', path: 'notes' },
    ],
    [
      'with a name of more than one line',
      {
        kind: 'update',
        path: 'notes',
        baseCommit: 'c'.repeat(40),
        skillName: 'Notes\nmore',
      },
    ],
  ])('refuses an update %s', async (_, extra) => {
    const app = await buildSkillsApp();

    const response = await request(app)
      .post('/agent-skills/pull-request')
      .set('gs-github-token', 'gh-token')
      .send({ ...body, ...extra });

    expect(response.status).toBe(400);
    expect(createSkillPullRequest).not.toHaveBeenCalled();
  });

  it.each(['../escape', 'Ticket Triage'])(
    'refuses a new skill named %p, which is not a slug',
    async skillName => {
      const app = await buildSkillsApp();

      const response = await request(app)
        .post('/agent-skills/pull-request')
        .set('gs-github-token', 'gh-token')
        .send({ ...body, skillName });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('lowercase slug');
      expect(createSkillPullRequest).not.toHaveBeenCalled();
    },
  );

  it('passes an update of a skill whose existing name is not a slug through', async () => {
    const app = await buildSkillsApp();
    const update = {
      ...body,
      skillName: 'Ticket Triage (v2)',
      kind: 'update',
      path: 'support/Ticket_Triage',
      baseCommit: 'c'.repeat(40),
    };

    const response = await request(app)
      .post('/agent-skills/pull-request')
      .set('gs-github-token', 'gh-token')
      .send(update);

    // Whether it is the skill's name is checked against the file there.
    expect(response.status).toBe(200);
    expect(createSkillPullRequest).toHaveBeenCalledWith({
      ...update,
      token: 'gh-token',
    });
  });

  it('accepts instructions at the 100,000-character cap, beyond the default 100 KB body', async () => {
    const app = await buildSkillsApp();
    // Two bytes each in UTF-8: a ~200 KB body.
    const instructions = 'ü'.repeat(100_000);
    expect(
      Buffer.byteLength(JSON.stringify({ ...body, instructions })),
    ).toBeGreaterThan(200_000);

    const response = await request(app)
      .post('/agent-skills/pull-request')
      .set('gs-github-token', 'gh-token')
      .send({ ...body, instructions });

    expect(response.status).toBe(200);
    expect(createSkillPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ instructions }),
    );
  });

  it('refuses instructions over the cap as invalid input, not as a too-large body', async () => {
    const app = await buildSkillsApp();

    const response = await request(app)
      .post('/agent-skills/pull-request')
      .set('gs-github-token', 'gh-token')
      .send({ ...body, instructions: 'x'.repeat(100_001) });

    expect(response.status).toBe(400);
    expect(createSkillPullRequest).not.toHaveBeenCalled();
  });

  it("forwards GitHub's refusal with its upstream status", async () => {
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
