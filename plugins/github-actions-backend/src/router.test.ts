import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { mockServices } from '@backstage/backend-test-utils';
import { AuthenticationError } from '@backstage/errors';
import {
  AuthLoginResult,
  McpContentItem,
  MusterServerGateway,
} from '@giantswarm/backstage-plugin-gs-node';
import express from 'express';
import request from 'supertest';
import { createRouter, RouterOptions } from './router';

const TOKEN_HEADER = 'backstage-muster-authorization';

type Call = { tool: string; args: Record<string, unknown>; authToken: string };

/** A GitHub MCP server through muster: answers keyed by tool, calls recorded. */
class FakeGithub implements MusterServerGateway {
  calls: Call[] = [];
  answers = new Map<
    string,
    unknown | ((args: Record<string, unknown>) => unknown)
  >();
  loginResult: AuthLoginResult = {
    status: 'connected',
    message: 'Already Connected',
  };
  failNextCallWith?: Error;
  logins = 0;

  constructor(readonly server: string) {}

  async call(tool: string, args: Record<string, unknown>, authToken: string) {
    this.calls.push({ tool, args, authToken });
    if (this.failNextCallWith) {
      const error = this.failNextCallWith;
      this.failNextCallWith = undefined;
      throw error;
    }
    const answer = this.answers.get(tool);
    if (answer === undefined) {
      throw new Error(`FakeGithub(${this.server}): no answer for ${tool}`);
    }
    return typeof answer === 'function' ? answer(args) : answer;
  }

  async callContent(): Promise<McpContentItem[]> {
    throw new Error('not used');
  }

  async login() {
    this.logins++;
    return this.loginResult;
  }
}

const RUN = {
  id: 33894429883,
  name: 'check-values-schema',
  head_branch: 'main',
  head_sha: '562b2cc',
  head_commit: { message: 'chore: align files' },
  status: 'completed',
  conclusion: 'success',
  html_url:
    'https://github.com/giantswarm/agent-platform/actions/runs/33894429883',
  workflow_id: 279805020,
};

describe('createRouter', () => {
  let actions: FakeGithub;
  let repos: FakeGithub;

  async function buildApp(
    options: Partial<RouterOptions> = {},
    { withToken = true }: { withToken?: boolean } = {},
  ) {
    const logger = mockServices.logger.mock();
    const router = await createRouter({
      logger,
      httpAuth: mockServices.httpAuth(),
      actions,
      repos,
      ...options,
    });
    const app = express();
    if (withToken) {
      app.use((req, _res, next) => {
        req.headers[TOKEN_HEADER] = 'dex-id-token-alice';
        next();
      });
    }
    app.use(router);
    app.use(
      MiddlewareFactory.create({
        logger,
        config: mockServices.rootConfig(),
      }).error(),
    );
    return app;
  }

  let app: express.Express;

  beforeEach(async () => {
    actions = new FakeGithub('github-actions');
    repos = new FakeGithub('github');
    app = await buildApp();
  });

  it('rejects requests without a Backstage user', async () => {
    const httpAuth = mockServices.httpAuth.mock({
      credentials: async () => {
        throw new AuthenticationError('nope');
      },
    });
    const res = await request(await buildApp({ httpAuth })).get(
      '/repos/giantswarm/agent-platform/runs',
    );
    expect(res.status).toBe(401);
  });

  it('returns 503 when muster is not configured', async () => {
    const res = await request(
      await buildApp({ actions: undefined, repos: undefined }),
    ).get('/repos/giantswarm/agent-platform/runs');
    expect(res.status).toBe(503);
    expect(res.body.error.message).toMatch(/githubActions\.muster/);
  });

  it('answers 401 without the muster token header', async () => {
    const res = await request(await buildApp({}, { withToken: false })).get(
      '/repos/giantswarm/agent-platform/runs',
    );
    expect(res.status).toBe(401);
    expect(res.body.error.message).toContain(TOKEN_HEADER);
    expect(actions.calls).toHaveLength(0);
  });

  it('rejects names that are not GitHub names', async () => {
    const res = await request(app).get('/repos/giant%20swarm/x/runs');
    expect(res.status).toBe(400);
    expect(actions.calls).toHaveLength(0);
  });

  describe('connection', () => {
    it('is connected when both servers hold the grant', async () => {
      const res = await request(app).get('/connection');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ connected: true });
      expect(actions.logins).toBe(1);
      expect(repos.logins).toBe(1);
    });

    it('reports the sign-in URL of the first server without a grant', async () => {
      repos.loginResult = {
        status: 'auth_required',
        authUrl: 'https://muster.example/oauth/proxy/start?state=x',
        message: 'Authentication required for github.',
      };
      const res = await request(app).get('/connection');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        connected: false,
        server: 'github',
        authUrl: 'https://muster.example/oauth/proxy/start?state=x',
        message: 'Authentication required for github.',
      });
    });

    it('asks one server once when repos and actions are the same', async () => {
      const res = await request(await buildApp({ repos: actions })).get(
        '/connection',
      );
      expect(res.body).toEqual({ connected: true });
      expect(actions.logins).toBe(1);
      expect(repos.logins).toBe(0);
    });
  });

  describe('runs', () => {
    it('lists workflow runs of a branch through the actions toolset', async () => {
      actions.answers.set('actions_list', {
        total_count: 1,
        workflow_runs: [RUN],
      });
      const res = await request(app).get(
        '/repos/giantswarm/agent-platform/runs?branch=main&page=2&pageSize=5',
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ total_count: 1, workflow_runs: [RUN] });
      expect(actions.calls).toEqual([
        {
          tool: 'actions_list',
          args: {
            method: 'list_workflow_runs',
            owner: 'giantswarm',
            repo: 'agent-platform',
            page: 2,
            perPage: 5,
            workflow_runs_filter: { branch: 'main' },
          },
          authToken: 'dex-id-token-alice',
        },
      ]);
    });

    it('treats page 0 as the first page and leaves the branch filter out', async () => {
      actions.answers.set('actions_list', {
        total_count: 0,
        workflow_runs: [],
      });
      await request(app).get('/repos/giantswarm/agent-platform/runs?page=0');
      expect(actions.calls[0].args).toEqual({
        method: 'list_workflow_runs',
        owner: 'giantswarm',
        repo: 'agent-platform',
        page: 1,
        perPage: 30,
      });
    });

    it('gets one run and its workflow', async () => {
      actions.answers.set('actions_get', (args: Record<string, unknown>) =>
        args.method === 'get_workflow'
          ? {
              id: 279805020,
              name: 'check-values-schema',
              path: '.github/workflows/x.yaml',
            }
          : RUN,
      );
      const run = await request(app).get(
        '/repos/giantswarm/agent-platform/runs/33894429883',
      );
      expect(run.status).toBe(200);
      expect(run.body).toEqual(RUN);
      expect(actions.calls[0].args).toEqual({
        method: 'get_workflow_run',
        owner: 'giantswarm',
        repo: 'agent-platform',
        resource_id: '33894429883',
      });
      const wf = await request(app).get(
        '/repos/giantswarm/agent-platform/workflows/279805020',
      );
      expect(wf.body.name).toBe('check-values-schema');
      expect(actions.calls[1].args).toMatchObject({
        method: 'get_workflow',
        resource_id: '279805020',
      });
    });

    it('unwraps the jobs payload the tool wraps once more', async () => {
      actions.answers.set('actions_list', {
        jobs: {
          total_count: 1,
          jobs: [
            { id: 101, name: 'validate', steps: [{ name: 'Set up job' }] },
          ],
        },
      });
      const res = await request(app).get(
        '/repos/giantswarm/agent-platform/runs/33894429883/jobs',
      );
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        total_count: 1,
        jobs: [{ id: 101, name: 'validate', steps: [{ name: 'Set up job' }] }],
      });
      expect(actions.calls[0].args).toEqual({
        method: 'list_workflow_jobs',
        owner: 'giantswarm',
        repo: 'agent-platform',
        resource_id: '33894429883',
        page: 1,
        perPage: 100,
      });
    });

    it('re-runs a workflow run as the person', async () => {
      actions.answers.set('actions_run_trigger', {
        message: 'Workflow run has been queued for re-run',
        run_id: 33894429883,
      });
      const res = await request(app).post(
        '/repos/giantswarm/agent-platform/runs/33894429883/rerun',
      );
      expect(res.status).toBe(201);
      expect(res.body.run_id).toBe(33894429883);
      expect(actions.calls[0].args).toEqual({
        method: 'rerun_workflow_run',
        owner: 'giantswarm',
        repo: 'agent-platform',
        run_id: 33894429883,
      });
    });

    it('returns a job log as plain text', async () => {
      actions.answers.set('get_job_logs', {
        job_id: 101,
        logs_content: 'line 1\nline 2\n',
        message: 'Job logs content retrieved successfully',
      });
      const res = await request(app).get(
        '/repos/giantswarm/agent-platform/jobs/101/logs',
      );
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
      expect(res.text).toBe('line 1\nline 2\n');
      expect(actions.calls[0].args).toEqual({
        owner: 'giantswarm',
        repo: 'agent-platform',
        job_id: 101,
        return_content: true,
        tail_lines: 10000,
      });
    });
  });

  describe('repository reads', () => {
    it('reads the default branch through a repository search', async () => {
      repos.answers.set('search_repositories', {
        total_count: 1,
        items: [
          { full_name: 'giantswarm/agent-platform', default_branch: 'main' },
        ],
      });
      const res = await request(app).get('/repos/giantswarm/agent-platform');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ default_branch: 'main' });
      expect(repos.calls[0].args).toEqual({
        query: 'repo:giantswarm/agent-platform',
        perPage: 1,
      });
      expect(actions.calls).toHaveLength(0);
    });

    it('answers 404 when the search finds another or no repository', async () => {
      repos.answers.set('search_repositories', {
        total_count: 1,
        items: [
          {
            full_name: 'giantswarm/agent-platform-fork',
            default_branch: 'dev',
          },
        ],
      });
      const res = await request(app).get('/repos/giantswarm/agent-platform');
      expect(res.status).toBe(404);
    });

    it('lists a page of branches', async () => {
      repos.answers.set('list_branches', [
        { name: 'main', protected: true },
        { name: 'renovate/x', protected: false },
      ]);
      const res = await request(app).get(
        '/repos/giantswarm/agent-platform/branches?page=3',
      );
      expect(res.status).toBe(200);
      expect(res.body.map((b: { name: string }) => b.name)).toEqual([
        'main',
        'renovate/x',
      ]);
      expect(repos.calls[0].args).toEqual({
        owner: 'giantswarm',
        repo: 'agent-platform',
        page: 3,
        perPage: 100,
      });
    });
  });

  describe('grants', () => {
    it('connects a session that never used the server and retries once', async () => {
      actions.failNextCallWith = new Error(
        'failed to connect to server github-actions: user not authenticated to server github-actions',
      );
      actions.answers.set('actions_list', {
        total_count: 0,
        workflow_runs: [],
      });
      const res = await request(app).get(
        '/repos/giantswarm/agent-platform/runs',
      );
      expect(res.status).toBe(200);
      expect(actions.logins).toBe(1);
      expect(actions.calls).toHaveLength(2);
    });

    it('answers 401 with the sign-in URL when the person has no grant', async () => {
      actions.failNextCallWith = new Error(
        'tool not found: x_gha_actions_list',
      );
      actions.loginResult = {
        status: 'auth_required',
        authUrl: 'https://muster.example/oauth/proxy/start?state=y',
        message: 'Authentication required for github-actions.',
      };
      const res = await request(app).get(
        '/repos/giantswarm/agent-platform/runs',
      );
      expect(res.status).toBe(401);
      expect(res.body.error).toMatchObject({
        name: 'MusterServerNotConnectedError',
        server: 'github-actions',
        authUrl: 'https://muster.example/oauth/proxy/start?state=y',
      });
    });

    it('maps GitHub refusals to 403/404', async () => {
      actions.failNextCallWith = new Error(
        'failed to get workflow run: GET https://api.github.com/...: 404 Not Found []',
      );
      const notFound = await request(app).get(
        '/repos/giantswarm/agent-platform/runs/1',
      );
      expect(notFound.status).toBe(404);
      actions.failNextCallWith = new Error(
        'Resource not accessible by integration',
      );
      const forbidden = await request(app).post(
        '/repos/giantswarm/agent-platform/runs/1/rerun',
      );
      expect(forbidden.status).toBe(403);
    });
  });
});
