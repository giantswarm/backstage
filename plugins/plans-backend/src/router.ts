import {
  HttpAuthService,
  LoggerService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import {
  InputError,
  NotAllowedError,
  NotFoundError,
  ServiceUnavailableError,
} from '@backstage/errors';
import { GithubCredentialsProvider } from '@backstage/integration';
import express from 'express';
import Router from 'express-promise-router';

const GITHUB_API_BASE_URL = 'https://api.github.com';

/** `owner/repo` slug, e.g. `giantswarm/bumblebee-plans`. */
const REPO_SLUG_PATTERN = /^[\w.-]+\/[\w.-]+$/;

/**
 * Scanning a repo for Epic headers is one GitHub call per plan document;
 * cache the result so the plans page and the roadmap epic view don't
 * re-crawl on every render.
 */
const EPICS_TTL_MS = 5 * 60_000;

/** Roadmap epic referenced by a plan's `**Epic:** [owner/repo#N](url)` header. */
interface EpicRef {
  owner: string;
  repo: string;
  number: number;
  url: string;
}

/** A line labelled with the Epic convention; captures the remainder. */
const EPIC_LINE_PATTERN = /^[ \t>]*(?:\*\*Epic:?\*\*:?|Epic:)(.*)$/gim;

/** Extract an `owner/repo#N` reference or GitHub issue URL from one line. */
function epicRefFromLine(line: string): EpicRef | null {
  const ref = line.match(/([\w.-]+)\/([\w.-]+)#(\d+)/);
  if (ref) {
    const [, owner, repo, number] = ref;
    return {
      owner,
      repo,
      number: parseInt(number, 10),
      url:
        line.match(/\((https?:\/\/[^)\s]+)\)/)?.[1] ??
        `https://github.com/${owner}/${repo}/issues/${number}`,
    };
  }
  const url = line.match(/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)/);
  if (url) {
    const [, owner, repo, number] = url;
    return {
      owner,
      repo,
      number: parseInt(number, 10),
      url: `https://github.com/${owner}/${repo}/issues/${number}`,
    };
  }
  return null;
}

/**
 * Parse the Epic header convention out of plan markdown: a line like
 * `**Epic:** [giantswarm/giantswarm#36625](https://github.com/...)`.
 * The `Epic:` label may be bold or plain and may sit inside a blockquote
 * (`> Epic: ...`). Accepts an `owner/repo#N` reference or a GitHub issue URL
 * anywhere on that line.
 *
 * Every Epic-labelled line is scanned and the first that actually yields a ref
 * wins -- not merely the first labelled line. Since the label matches a plain
 * `Epic:` anywhere at line start, a stray earlier line (prose, a caption) can
 * carry the label without a usable ref; stopping at it would mask a real
 * `**Epic:** [owner/repo#N]` header further down.
 */
export function parseEpicRef(markdown: string): EpicRef | null {
  for (const match of markdown.matchAll(EPIC_LINE_PATTERN)) {
    const epic = epicRefFromLine(match[1]);
    if (epic) {
      return epic;
    }
  }
  return null;
}

/**
 * A plan document eligible for Epic parsing: a direct child of a top-level
 * plan folder (one folder per plan by convention, same as the frontend's
 * grouping).
 */
const isPlanDoc = (path: string) => /^[^/]+\/[^/]+\.md$/i.test(path);

/** The added lines of a unified diff, for parsing headers out of PR patches. */
const patchAdditions = (patch: string) =>
  patch
    .split('\n')
    .filter(diffLine => diffLine.startsWith('+'))
    .map(diffLine => diffLine.slice(1))
    .join('\n');

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
      // Surface GitHub's own explanation (e.g. "Resource not accessible by
      // integration", which is what a missing GitHub App write permission
      // looks like) instead of an opaque status code.
      const detail = await response.text().catch(() => '');
      const message = `GitHub responded with ${response.status} for ${path}${
        detail ? `: ${detail}` : ''
      }`;
      // A 403 is an authorization failure -- almost always the GitHub App
      // lacking a permission (Pull requests / Issues: write) -- not a fault on
      // our side. Map it to a real 403 so the client sees an actionable error
      // rather than a 500, and so it does not page us through Sentry.
      if (response.status === 403) {
        throw new NotAllowedError(message);
      }
      throw new Error(message);
    }
    return response.json();
  };
  const githubGet = (repo: string, path: string) => githubRequest(repo, path);

  /** Fetch a file's decoded UTF-8 content via the GitHub contents API. */
  const getFileContent = async (
    repo: string,
    path: string,
    ref: string,
  ): Promise<string> => {
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
    return Buffer.from(result.content, 'base64').toString('utf8');
  };

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
    res.json({ path, ref, content: await getFileContent(repo, path, ref) });
  });

  const epicsCache = new Map<string, { expires: number; data: unknown }>();

  /**
   * The epic each plan references, for cross-linking plans with the roadmap
   * board: merged plans scanned on the default branch, proposed plans parsed
   * from their PR diffs.
   */
  router.get('/epics', async (req, res) => {
    const repo = resolveRepo(req);
    const hit = epicsCache.get(repo);
    if (hit && hit.expires > Date.now()) {
      res.json(hit.data);
      return;
    }

    // Merged plans: scan each plan folder's direct-child markdown files
    // (PRD.md first) until one carries an Epic header.
    const treeResult = (await githubGet(
      repo,
      `/repos/${repo}/git/trees/HEAD?recursive=1`,
    )) as {
      tree?: Array<{ path?: string; type?: string }> | null;
    };
    const byFolder = new Map<string, string[]>();
    for (const entry of treeResult.tree ?? []) {
      if (entry.type !== 'blob' || !entry.path || !isPlanDoc(entry.path)) {
        continue;
      }
      const folder = entry.path.slice(0, entry.path.indexOf('/'));
      byFolder.set(folder, [...(byFolder.get(folder) ?? []), entry.path]);
    }
    const docRank = (path: string) =>
      path.toLowerCase().endsWith('/prd.md') ? 0 : 1;
    const merged = (
      await Promise.all(
        [...byFolder.entries()].map(async ([folder, files]) => {
          const candidates = [...files].sort(
            (a, b) => docRank(a) - docRank(b) || a.localeCompare(b),
          );
          for (const path of candidates) {
            const epic = parseEpicRef(
              await getFileContent(repo, path, 'HEAD').catch(() => ''),
            );
            if (epic) {
              return { folder, path, epic };
            }
          }
          return null;
        }),
      )
    ).filter(entry => entry !== null);

    // Proposed plans: the Epic header of a new plan document shows up in
    // the added lines of the PR diff.
    // ponytail: patch-only parse -- misses a PRD whose patch GitHub omits
    // (oversized file); fetch content at the head branch if that ever happens.
    const openPulls = (await githubGet(
      repo,
      `/repos/${repo}/pulls?state=open&per_page=100`,
    )) as Array<{ number: number; title: string }>;
    const pulls = (
      await Promise.all(
        openPulls.map(async pull => {
          const files = (await githubGet(
            repo,
            `/repos/${repo}/pulls/${pull.number}/files?per_page=100`,
          )) as Array<{ filename?: string; patch?: string }>;
          for (const file of files) {
            if (!file.filename || !isPlanDoc(file.filename) || !file.patch) {
              continue;
            }
            const epic = parseEpicRef(patchAdditions(file.patch));
            if (epic) {
              return { number: pull.number, title: pull.title, epic };
            }
          }
          return null;
        }),
      )
    ).filter(entry => entry !== null);

    const data = { merged, pulls };
    epicsCache.set(repo, { expires: Date.now() + EPICS_TTL_MS, data });
    res.json(data);
  });

  return router;
}
