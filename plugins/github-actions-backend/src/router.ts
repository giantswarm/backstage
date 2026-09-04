import { HttpAuthService, LoggerService } from '@backstage/backend-plugin-api';
import {
  AuthenticationError,
  InputError,
  NotAllowedError,
  NotFoundError,
  ServiceUnavailableError,
} from '@backstage/errors';
import {
  asConnected,
  MUSTER_AUTH_HEADER,
  MusterServerGateway,
  MusterServerNotConnectedError,
} from '@giantswarm/backstage-plugin-gs-node';
import express from 'express';
import Router from 'express-promise-router';

export interface RouterOptions {
  logger: LoggerService;
  httpAuth: HttpAuthService;
  /**
   * GitHub's `actions` toolset through muster, as the caller (the remote
   * GitHub MCP server at `/mcp/x/actions/`); undefined when unconfigured.
   */
  actions?: MusterServerGateway;
  /**
   * GitHub's repository tools through muster, as the caller: the default
   * branch and the branch list. Usually the `github` server the plans plugin
   * uses; defaults to `actions` (which does not carry those tools).
   */
  repos?: MusterServerGateway;
}

/** GitHub owner and repository names: letters, digits, `-`, `_`, `.`. */
const GITHUB_NAME = /^[A-Za-z0-9_.-]{1,100}$/;
/** The largest page GitHub serves. */
const MAX_PAGE_SIZE = 100;
/** Lines of a job log the tab shows (GitHub's tool returns the tail). */
const LOG_TAIL_LINES = 10_000;

function repoOf(req: express.Request): { owner: string; repo: string } {
  const { owner, repo } = req.params as Record<string, string>;
  if (!GITHUB_NAME.test(owner) || !GITHUB_NAME.test(repo)) {
    throw new InputError('owner and repo must be GitHub names');
  }
  return { owner, repo };
}

function positiveInt(raw: unknown, name: string): number {
  if (typeof raw !== 'string' || !/^\d{1,15}$/.test(raw)) {
    throw new InputError(`${name} must be a positive integer`);
  }
  const value = parseInt(raw, 10);
  if (value <= 0) {
    throw new InputError(`${name} must be a positive integer`);
  }
  return value;
}

/** `page` as GitHub counts it (1-based); an absent or 0 page is the first. */
function pageOf(raw: unknown): number {
  if (raw === undefined || raw === '' || raw === '0') {
    return 1;
  }
  return positiveInt(raw, 'page');
}

function pageSizeOf(raw: unknown, fallback: number): number {
  if (raw === undefined || raw === '') {
    return fallback;
  }
  return Math.min(positiveInt(raw, 'pageSize'), MAX_PAGE_SIZE);
}

function singleQueryValue(value: unknown, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new InputError(`${name} must be provided at most once`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The `items` of a search result, or the bare array some tools answer with. */
function searchItems(payload: unknown): unknown[] {
  return listOf(payload, 'items');
}

/** A tool's list payload: the bare array, or the array under `key`. */
function listOf(payload: unknown, key: string): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (isRecord(payload) && Array.isArray(payload[key])) {
    return payload[key] as unknown[];
  }
  return [];
}

/**
 * GitHub's MCP server answers a refusal with GitHub's message; map the ones a
 * person can act on to a 403/404 so the tab shows them instead of a server
 * fault.
 */
function mapGithubError(error: unknown): unknown {
  if (!(error instanceof Error)) {
    return error;
  }
  const message = error.message;
  if (
    /Resource not accessible by (integration|personal access token)/i.test(
      message,
    )
  ) {
    return new NotAllowedError(
      `GitHub rejected the request: ${message}. Your GitHub account, or the GitHub App muster connects with, lacks a permission on this repository.`,
    );
  }
  if (/\b(401|403)\b|FORBIDDEN|forbidden/i.test(message)) {
    return new NotAllowedError(`GitHub rejected the request: ${message}`);
  }
  if (/\b404\b|NOT_FOUND|Could not resolve|not found/i.test(message)) {
    return new NotFoundError(`GitHub resource not found: ${message}`);
  }
  return error;
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, httpAuth, actions } = options;
  const repos = options.repos ?? actions;

  // The plugin ships in every portal image; only portals that point it at a
  // muster serve it. Same opt-in as the plans and roadmap backends (no
  // config -> 503) -- the frontend then keeps the community client.
  if (!actions) {
    logger.info(
      'No muster GitHub Actions server configured (set githubActions.muster); github-actions endpoints will return 503.',
    );
  }

  const gateway = (g: MusterServerGateway | undefined): MusterServerGateway => {
    if (!g) {
      throw new ServiceUnavailableError(
        'The GitHub Actions plugin is not wired to muster on this portal. Set githubActions.muster.',
      );
    }
    return g;
  };

  /**
   * The caller's muster token: the frontend forwards the user's Dex ID
   * token, the same one the muster plugin sends. muster maps it to the
   * person's GitHub grant; there is no GitHub credential anywhere here.
   */
  const musterToken = (req: express.Request): string => {
    const header = req.headers[MUSTER_AUTH_HEADER];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token) {
      throw new AuthenticationError(
        `GitHub Actions requests need the caller's muster token in the ${MUSTER_AUTH_HEADER} header.`,
      );
    }
    return token;
  };

  /** One request's GitHub session: every tool runs as the caller. */
  const sessionFor = (req: express.Request) => {
    const token = musterToken(req);
    const via =
      (gw: MusterServerGateway) =>
      (tool: string, args: Record<string, unknown>): Promise<unknown> =>
        asConnected(gw, gw.server, token, async () => {
          try {
            return await gw.call(tool, args, token);
          } catch (error) {
            throw mapGithubError(error);
          }
        });
    return {
      token,
      actions: via(gateway(actions)),
      repos: via(gateway(repos)),
    };
  };

  const router = Router();
  router.use(express.json());

  router.use(async (req, res, next) => {
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    res.locals.userRef = credentials.principal.userEntityRef;
    gateway(actions);
    next();
  });

  /**
   * Whether the caller's muster session can reach GitHub, and the sign-in
   * URL when it cannot yet. Lets the frontend offer "Connect GitHub" before
   * the tab's first failing request, and poll after the popup. Both servers
   * share the person's grant, so the first one that needs a sign-in answers.
   */
  router.get('/connection', async (req, res) => {
    const token = musterToken(req);
    const servers = [gateway(actions)];
    if (repos && repos !== actions) {
      servers.push(repos);
    }
    for (const server of servers) {
      const login = await server.login(token);
      if (login.status !== 'connected') {
        res.json({
          connected: false,
          server: server.server,
          authUrl: login.authUrl,
          message: login.message,
        });
        return;
      }
    }
    res.json({ connected: true });
  });

  /** The repository's default branch (the tab's initial branch filter). */
  router.get('/repos/:owner/:repo', async (req, res) => {
    const { owner, repo } = repoOf(req);
    const payload = await sessionFor(req).repos('search_repositories', {
      query: `repo:${owner}/${repo}`,
      perPage: 1,
    });
    const items = searchItems(payload);
    const found = items.find(
      (item): item is Record<string, unknown> =>
        isRecord(item) &&
        typeof item.default_branch === 'string' &&
        (typeof item.full_name !== 'string' ||
          item.full_name.toLowerCase() === `${owner}/${repo}`.toLowerCase()),
    );
    if (!found) {
      throw new NotFoundError(
        `GitHub repository ${owner}/${repo} not found, or not visible to you.`,
      );
    }
    res.json({ default_branch: found.default_branch });
  });

  /** One page of the repository's branches (the tab's branch picker). */
  router.get('/repos/:owner/:repo/branches', async (req, res) => {
    const { owner, repo } = repoOf(req);
    const payload = await sessionFor(req).repos('list_branches', {
      owner,
      repo,
      page: pageOf(singleQueryValue(req.query.page, 'page')),
      perPage: MAX_PAGE_SIZE,
    });
    res.json(listOf(payload, 'branches'));
  });

  router.get('/repos/:owner/:repo/workflows/:workflowId', async (req, res) => {
    const { owner, repo } = repoOf(req);
    const workflowId = positiveInt(req.params.workflowId, 'workflowId');
    const payload = await sessionFor(req).actions('actions_get', {
      method: 'get_workflow',
      owner,
      repo,
      resource_id: String(workflowId),
    });
    res.json(payload);
  });

  /**
   * Workflow runs, newest first, as GitHub's REST payload
   * (`{ total_count, workflow_runs }`), optionally for one branch.
   */
  router.get('/repos/:owner/:repo/runs', async (req, res) => {
    const { owner, repo } = repoOf(req);
    const branch = singleQueryValue(req.query.branch, 'branch');
    const payload = await sessionFor(req).actions('actions_list', {
      method: 'list_workflow_runs',
      owner,
      repo,
      page: pageOf(singleQueryValue(req.query.page, 'page')),
      perPage: pageSizeOf(singleQueryValue(req.query.pageSize, 'pageSize'), 30),
      ...(branch ? { workflow_runs_filter: { branch } } : {}),
    });
    res.json(payload);
  });

  router.get('/repos/:owner/:repo/runs/:runId', async (req, res) => {
    const { owner, repo } = repoOf(req);
    const runId = positiveInt(req.params.runId, 'runId');
    const payload = await sessionFor(req).actions('actions_get', {
      method: 'get_workflow_run',
      owner,
      repo,
      resource_id: String(runId),
    });
    res.json(payload);
  });

  /** The run's jobs (`{ total_count, jobs }`, steps included). */
  router.get('/repos/:owner/:repo/runs/:runId/jobs', async (req, res) => {
    const { owner, repo } = repoOf(req);
    const runId = positiveInt(req.params.runId, 'runId');
    const payload = await sessionFor(req).actions('actions_list', {
      method: 'list_workflow_jobs',
      owner,
      repo,
      resource_id: String(runId),
      page: pageOf(singleQueryValue(req.query.page, 'page')),
      perPage: pageSizeOf(
        singleQueryValue(req.query.pageSize, 'pageSize'),
        MAX_PAGE_SIZE,
      ),
    });
    // The tool wraps GitHub's payload once more: { jobs: { total_count, jobs } }.
    const jobs =
      isRecord(payload) &&
      isRecord(payload.jobs) &&
      Array.isArray(payload.jobs.jobs)
        ? payload.jobs
        : payload;
    res.json(jobs);
  });

  /** Re-runs a workflow run (all jobs), as the person. */
  router.post('/repos/:owner/:repo/runs/:runId/rerun', async (req, res) => {
    const { owner, repo } = repoOf(req);
    const runId = positiveInt(req.params.runId, 'runId');
    const payload = await sessionFor(req).actions('actions_run_trigger', {
      method: 'rerun_workflow_run',
      owner,
      repo,
      run_id: runId,
    });
    res.status(201).json(payload ?? {});
  });

  /** The tail of one job's log, as plain text. */
  router.get('/repos/:owner/:repo/jobs/:jobId/logs', async (req, res) => {
    const { owner, repo } = repoOf(req);
    const jobId = positiveInt(req.params.jobId, 'jobId');
    const payload = await sessionFor(req).actions('get_job_logs', {
      owner,
      repo,
      job_id: jobId,
      return_content: true,
      tail_lines: LOG_TAIL_LINES,
    });
    let text = '';
    if (typeof payload === 'string') {
      text = payload;
    } else if (isRecord(payload)) {
      if (typeof payload.logs_content === 'string') {
        text = payload.logs_content;
      } else if (typeof payload.logs_url === 'string') {
        text = `The log is available at ${payload.logs_url}`;
      }
    }
    res.type('text/plain').send(text);
  });

  // A missing grant is a 401 that carries the sign-in URL, so the client can
  // offer the connect step instead of showing a failure.
  router.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (error instanceof MusterServerNotConnectedError) {
        res.status(401).json({
          error: {
            name: error.name,
            message: error.message,
            server: error.server,
            authUrl: error.authUrl,
          },
        });
        return;
      }
      next(error);
    },
  );

  return router;
}
