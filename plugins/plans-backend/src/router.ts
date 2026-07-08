import {
  HttpAuthService,
  LoggerService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import {
  InputError,
  NotFoundError,
  ServiceUnavailableError,
} from '@backstage/errors';
import { GithubCredentialsProvider } from '@backstage/integration';
import express from 'express';
import Router from 'express-promise-router';

const GITHUB_API_BASE_URL = 'https://api.github.com';

/** `owner/repo` slug, e.g. `giantswarm/bumblebee-plans`. */
const REPO_SLUG_PATTERN = /^[\w.-]+\/[\w.-]+$/;

export interface RouterOptions {
  logger: LoggerService;
  config: Config;
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  credentialsProvider: GithubCredentialsProvider;
  /** Overridable for tests; defaults to the global fetch. */
  fetchFn?: typeof fetch;
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

/** GitHub issue-comment / review-comment shape (the fields we map). */
interface GithubComment {
  id: number;
  user?: { login?: string } | null;
  body?: string;
  created_at?: string;
  html_url?: string;
  path?: string;
  line?: number | null;
  original_line?: number | null;
  side?: string;
  in_reply_to_id?: number;
}

function mapComment(comment: GithubComment) {
  return {
    id: comment.id,
    author: comment.user?.login,
    body: comment.body ?? '',
    createdAt: comment.created_at,
    htmlUrl: comment.html_url,
  };
}

function mapReviewComment(comment: GithubComment) {
  return {
    ...mapComment(comment),
    path: comment.path,
    // `line` is null when the diff moved on; fall back to the original line.
    line: comment.line ?? comment.original_line ?? undefined,
    side: comment.side,
    inReplyTo: comment.in_reply_to_id,
  };
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, config, httpAuth, userInfo, credentialsProvider } = options;
  const fetchFn = options.fetchFn ?? fetch;

  const repositories = (
    config.getOptionalStringArray('plans.repositories') ?? []
  ).map(repo => {
    if (!REPO_SLUG_PATTERN.test(repo)) {
      throw new Error(
        `Invalid plans.repositories entry '${repo}'; expected an owner/repo slug`,
      );
    }
    return repo;
  });

  if (repositories.length === 0) {
    logger.info(
      'No plan repositories configured (set plans.repositories); plans endpoints will return 503.',
    );
  }

  /**
   * Resolve the target repository for a request from `?repo=`. Defaults to
   * the only repository when exactly one is configured. Only configured
   * repositories are accepted -- this is what scopes the GitHub App token
   * proxy to plan repos instead of arbitrary ones.
   */
  const resolveRepo = (req: express.Request): string => {
    if (repositories.length === 0) {
      throw new ServiceUnavailableError(
        'No plan repository is configured. Set plans.repositories.',
      );
    }
    const requested = singleQueryValue(req.query.repo, 'repo');
    if (!requested) {
      if (repositories.length > 1) {
        throw new InputError(
          `repo query parameter is required; configured repositories: ${repositories.join(', ')}`,
        );
      }
      return repositories[0];
    }
    if (!repositories.includes(requested)) {
      throw new InputError(
        `Unknown repository '${requested}'; configured repositories: ${repositories.join(', ')}`,
      );
    }
    return requested;
  };

  /** Call a GitHub REST API path with the integration's App credentials. */
  const githubRequest = async (
    repo: string,
    path: string,
    init?: { method: 'POST'; body: unknown },
  ): Promise<unknown> => {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    try {
      const { token } = await credentialsProvider.getCredentials({
        url: `https://github.com/${repo}`,
      });
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      // Proceed without auth -- may still work for public repos.
      logger.warn(`Failed to get GitHub credentials for ${repo}: ${error}`);
    }

    const response = await fetchFn(`${GITHUB_API_BASE_URL}${path}`, {
      headers: init
        ? { ...headers, 'Content-Type': 'application/json' }
        : headers,
      ...(init && {
        method: init.method,
        body: JSON.stringify(init.body),
      }),
    });
    if (response.status === 404) {
      throw new NotFoundError(`GitHub responded with 404 for ${path}`);
    }
    if (!response.ok) {
      throw new Error(`GitHub responded with ${response.status} for ${path}`);
    }
    return response.json();
  };
  const githubGet = (repo: string, path: string) => githubRequest(repo, path);

  const parsePullNumber = (raw: string): number => {
    const pullNumber = parseInt(raw, 10);
    if (!Number.isInteger(pullNumber) || pullNumber <= 0) {
      throw new InputError('number must be a positive integer');
    }
    return pullNumber;
  };

  /**
   * Comments are written with the GitHub App token, so GitHub attributes
   * them to the app's bot account. Prefix the body with the Backstage user
   * so authorship survives on GitHub itself.
   */
  const attributedBody = async (
    req: express.Request,
    body: string,
  ): Promise<string> => {
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    const info = await userInfo.getUserInfo(credentials);
    // 'user:default/jdoe' -> 'jdoe'
    const name = info.userEntityRef.split('/').pop() ?? info.userEntityRef;
    return `**${name}** (via Dev Portal):\n\n${body}`;
  };

  const requireBody = (req: express.Request): string => {
    const body = req.body?.body;
    if (typeof body !== 'string' || body.trim() === '') {
      throw new InputError('body must be a non-empty string');
    }
    return body;
  };

  const router = Router();
  router.use(express.json());

  // All routes serve private-repo content; require a Backstage user.
  router.use(async (req, _res, next) => {
    await httpAuth.credentials(req, { allow: ['user'] });
    next();
  });

  router.get('/repos', (_, res) => {
    res.json({ repositories });
  });

  router.get('/pulls', async (req, res) => {
    const repo = resolveRepo(req);
    const pulls = (await githubGet(
      repo,
      `/repos/${repo}/pulls?state=open&per_page=100`,
    )) as Array<{
      number: number;
      title: string;
      user?: { login?: string } | null;
      draft?: boolean;
      head?: { ref?: string } | null;
      updated_at?: string;
      body?: string | null;
    }>;

    res.json({
      pulls: pulls.map(pull => ({
        number: pull.number,
        title: pull.title,
        author: pull.user?.login,
        draft: Boolean(pull.draft),
        branch: pull.head?.ref,
        updatedAt: pull.updated_at,
        body: pull.body ?? '',
      })),
    });
  });

  router.get('/pulls/:number/files', async (req, res) => {
    const repo = resolveRepo(req);
    const pullNumber = parsePullNumber(req.params.number);
    const files = (await githubGet(
      repo,
      `/repos/${repo}/pulls/${pullNumber}/files?per_page=100`,
    )) as Array<{
      filename: string;
      status: string;
      additions?: number;
      deletions?: number;
      patch?: string;
      previous_filename?: string;
    }>;

    res.json({
      files: files.map(file => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions ?? 0,
        deletions: file.deletions ?? 0,
        patch: file.patch,
        previousFilename: file.previous_filename,
      })),
    });
  });

  // General PR discussion (GitHub issue comments).
  router.get('/pulls/:number/comments', async (req, res) => {
    const repo = resolveRepo(req);
    const pullNumber = parsePullNumber(req.params.number);
    const comments = (await githubGet(
      repo,
      `/repos/${repo}/issues/${pullNumber}/comments?per_page=100`,
    )) as GithubComment[];

    res.json({ comments: comments.map(mapComment) });
  });

  router.post('/pulls/:number/comments', async (req, res) => {
    const repo = resolveRepo(req);
    const pullNumber = parsePullNumber(req.params.number);
    const body = await attributedBody(req, requireBody(req));
    const created = (await githubRequest(
      repo,
      `/repos/${repo}/issues/${pullNumber}/comments`,
      { method: 'POST', body: { body } },
    )) as GithubComment;

    res.status(201).json({ comment: mapComment(created) });
  });

  // Inline review comments on changed lines (GitHub pull review comments).
  router.get('/pulls/:number/review-comments', async (req, res) => {
    const repo = resolveRepo(req);
    const pullNumber = parsePullNumber(req.params.number);
    const comments = (await githubGet(
      repo,
      `/repos/${repo}/pulls/${pullNumber}/comments?per_page=100`,
    )) as GithubComment[];

    res.json({ comments: comments.map(mapReviewComment) });
  });

  router.post('/pulls/:number/review-comments', async (req, res) => {
    const repo = resolveRepo(req);
    const pullNumber = parsePullNumber(req.params.number);
    const body = await attributedBody(req, requireBody(req));

    const { path, line, inReplyTo } = req.body ?? {};

    let payload: Record<string, unknown>;
    if (inReplyTo !== undefined) {
      if (!Number.isInteger(inReplyTo) || inReplyTo <= 0) {
        throw new InputError('inReplyTo must be a positive integer');
      }
      payload = { body, in_reply_to: inReplyTo };
    } else {
      if (typeof path !== 'string' || path === '') {
        throw new InputError('path must be a non-empty string');
      }
      if (!Number.isInteger(line) || line <= 0) {
        throw new InputError('line must be a positive integer');
      }
      // New threads need the PR head commit id.
      const pull = (await githubGet(
        repo,
        `/repos/${repo}/pulls/${pullNumber}`,
      )) as { head?: { sha?: string } | null };
      if (!pull.head?.sha) {
        throw new Error(`Could not resolve head commit of PR #${pullNumber}`);
      }
      payload = {
        body,
        commit_id: pull.head.sha,
        path,
        line,
        side: 'RIGHT',
      };
    }

    const created = (await githubRequest(
      repo,
      `/repos/${repo}/pulls/${pullNumber}/comments`,
      { method: 'POST', body: payload },
    )) as GithubComment;

    res.status(201).json({ comment: mapReviewComment(created) });
  });

  router.get('/tree', async (req, res) => {
    const repo = resolveRepo(req);
    // HEAD resolves to the repository's default branch on the GitHub side.
    const ref = singleQueryValue(req.query.ref, 'ref') ?? 'HEAD';
    const result = (await githubGet(
      repo,
      `/repos/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    )) as {
      truncated?: boolean;
      tree?: Array<{ path?: string; type?: string; size?: number }> | null;
    };

    res.json({
      truncated: Boolean(result.truncated),
      tree: (result.tree ?? []).map(entry => ({
        path: entry.path,
        type: entry.type,
        size: entry.size,
      })),
    });
  });

  router.get('/content', async (req, res) => {
    const repo = resolveRepo(req);
    const ref = singleQueryValue(req.query.ref, 'ref') ?? 'HEAD';
    const path = singleQueryValue(req.query.path, 'path');
    if (!path) {
      throw new InputError('path query parameter is required');
    }
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const result = (await githubGet(
      repo,
      `/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
    )) as {
      type?: string;
      content?: string;
      encoding?: string;
    };

    if (Array.isArray(result) || result.type !== 'file') {
      throw new InputError(`'${path}' is not a file`);
    }
    if (result.encoding !== 'base64' || typeof result.content !== 'string') {
      throw new Error(
        `Unexpected content encoding '${result.encoding}' for ${path}`,
      );
    }

    res.json({
      path,
      ref,
      content: Buffer.from(result.content, 'base64').toString('utf8'),
    });
  });

  return router;
}
