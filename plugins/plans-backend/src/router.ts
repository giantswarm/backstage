import { HttpAuthService, LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
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

/** `owner/repo` slug, e.g. `giantswarm/bumblebee-plans`. */
const REPO_SLUG_PATTERN = /^[\w.-]+\/[\w.-]+$/;

/**
 * Scanning a repo for Epic headers is one GitHub call per plan document;
 * cache the result so the plans page and the roadmap epic view don't
 * re-crawl on every render.
 */
const EPICS_TTL_MS = 5 * 60_000;

/** Directory walks stop here; a plan repository is a handful of folders deep. */
const TREE_MAX_DEPTH = 8;
const TREE_MAX_ENTRIES = 2000;

/** Roadmap epic referenced by a plan's `**Epic:** [owner/repo#N](url)` header. */
interface EpicRef {
  owner: string;
  repo: string;
  number: number;
  url: string;
}

/**
 * Parse the Epic header convention out of plan markdown: a line like
 * `**Epic:** [giantswarm/giantswarm#36625](https://github.com/...)`.
 * Accepts an `owner/repo#N` reference or a GitHub issue URL anywhere on
 * that line; the first Epic line wins.
 */
export function parseEpicRef(markdown: string): EpicRef | null {
  const line = markdown.match(/^[ \t]*\*\*Epic:?\*\*:?(.*)$/im)?.[1];
  if (!line) {
    return null;
  }
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
  /** GitHub as the caller, through muster; undefined when unconfigured. */
  github?: MusterServerGateway;
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

/**
 * A comment as the GitHub MCP server returns it. Issue comments come in
 * GitHub's REST shape (`id`, `user.login`); review-thread comments come from
 * GraphQL with `author` as a login string and no numeric id, which is then
 * read off the `#discussion_r<id>` anchor of `html_url`.
 */
interface GithubComment {
  id?: number;
  user?: { login?: string } | null;
  author?: string | { login?: string } | null;
  body?: string;
  created_at?: string;
  html_url?: string;
  path?: string;
  line?: number | null;
  original_line?: number | null;
  side?: string;
  in_reply_to_id?: number;
}

interface ReviewThread {
  id?: string;
  comments?: GithubComment[];
}

interface ReviewThreadsPage {
  review_threads?: ReviewThread[];
  pageInfo?: { hasNextPage?: boolean; endCursor?: string };
}

const REVIEW_COMMENT_ANCHOR = /#discussion_r(\d+)$/;

function commentId(comment: GithubComment): number | undefined {
  if (typeof comment.id === 'number') {
    return comment.id;
  }
  const anchor = comment.html_url?.match(REVIEW_COMMENT_ANCHOR)?.[1];
  return anchor ? parseInt(anchor, 10) : undefined;
}

function commentAuthor(comment: GithubComment): string | undefined {
  if (comment.user?.login) {
    return comment.user.login;
  }
  if (typeof comment.author === 'string') {
    return comment.author;
  }
  return comment.author?.login ?? undefined;
}

function mapComment(comment: GithubComment) {
  return {
    id: commentId(comment),
    author: commentAuthor(comment),
    body: comment.body ?? '',
    createdAt: comment.created_at,
    htmlUrl: comment.html_url,
  };
}

function mapReviewComment(comment: GithubComment, inReplyTo?: number) {
  return {
    ...mapComment(comment),
    path: comment.path,
    // `line` is null when the diff moved on; fall back to the original line.
    line: comment.line ?? comment.original_line ?? undefined,
    side: comment.side ?? 'RIGHT',
    inReplyTo: comment.in_reply_to_id ?? inReplyTo,
  };
}

/** Flatten review threads into the comment list the frontend renders. */
function flattenReviewThreads(threads: ReviewThread[]) {
  const comments: ReturnType<typeof mapReviewComment>[] = [];
  for (const thread of threads) {
    const [root, ...replies] = thread.comments ?? [];
    if (!root) {
      continue;
    }
    const rootId = commentId(root);
    comments.push(mapReviewComment(root));
    for (const reply of replies) {
      comments.push(mapReviewComment(reply, rootId));
    }
  }
  return comments;
}

/** `git ref` for the GitHub MCP tools; HEAD means the default branch. */
function gitRef(ref: string): string | undefined {
  if (ref === 'HEAD') {
    return undefined;
  }
  if (ref.startsWith('refs/')) {
    return ref;
  }
  // A branch name (PR head) or a tag; branches are what the plans page uses.
  return `refs/heads/${ref}`;
}

function splitRepo(repo: string): { owner: string; repo: string } {
  const [owner, name] = repo.split('/');
  return { owner, repo: name };
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, config, httpAuth, github } = options;

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
  if (!github) {
    logger.info(
      'No muster GitHub server configured (set plans.muster); plans endpoints will return 503.',
    );
  }

  /**
   * Resolve the target repository for a request from `?repo=`. Defaults to
   * the only repository when exactly one is configured. Only configured
   * repositories are accepted -- this keeps the proxy scoped to plan repos
   * instead of being a general GitHub relay.
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

  const gateway = (): MusterServerGateway => {
    if (!github) {
      throw new ServiceUnavailableError(
        'GitHub access through muster is not configured. Set plans.muster.',
      );
    }
    return github;
  };

  /**
   * The caller's muster token: the frontend forwards the user's Dex ID token,
   * the same one the muster plugin sends. muster maps it to the person's
   * GitHub grant; there is no GitHub credential anywhere in the portal.
   */
  const musterToken = (req: express.Request): string => {
    const header = req.headers[MUSTER_AUTH_HEADER];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token) {
      throw new AuthenticationError(
        `Plans requests need the caller's muster token in the ${MUSTER_AUTH_HEADER} header.`,
      );
    }
    return token;
  };

  /** A GitHub session for one request: every call runs as the caller. */
  const githubFor = (req: express.Request) => {
    const gh = gateway();
    const token = musterToken(req);
    const call = <T>(tool: string, args: Record<string, unknown>) =>
      asConnected(gh, gh.server, token, () =>
        gh.call(tool, args, token),
      ) as Promise<T>;
    const callContent = (tool: string, args: Record<string, unknown>) =>
      asConnected(gh, gh.server, token, () =>
        gh.callContent(tool, args, token),
      );
    return { call, callContent, token };
  };

  type GithubSession = ReturnType<typeof githubFor>;

  const listOpenPulls = (gh: GithubSession, repo: string) =>
    gh.call<
      Array<{
        number: number;
        title: string;
        user?: { login?: string } | null;
        draft?: boolean;
        head?: { ref?: string; sha?: string } | null;
        updated_at?: string;
        body?: string | null;
      }>
    >('list_pull_requests', {
      ...splitRepo(repo),
      state: 'open',
      perPage: 100,
    });

  const listPullFiles = (gh: GithubSession, repo: string, pullNumber: number) =>
    gh.call<
      Array<{
        filename: string;
        status: string;
        additions?: number;
        deletions?: number;
        patch?: string;
        previous_filename?: string;
      }>
    >('pull_request_read', {
      method: 'get_files',
      ...splitRepo(repo),
      pullNumber,
      perPage: 100,
    });

  const listReviewThreads = async (
    gh: GithubSession,
    repo: string,
    pullNumber: number,
  ): Promise<ReviewThread[]> => {
    const threads: ReviewThread[] = [];
    let after: string | undefined;
    // A plan review rarely has more than a few dozen threads; the cap only
    // guards against a runaway cursor.
    for (let page = 0; page < 10; page++) {
      const result = await gh.call<ReviewThreadsPage>('pull_request_read', {
        method: 'get_review_comments',
        ...splitRepo(repo),
        pullNumber,
        perPage: 100,
        ...(after && { after }),
      });
      threads.push(...(result.review_threads ?? []));
      if (!result.pageInfo?.hasNextPage || !result.pageInfo.endCursor) {
        break;
      }
      after = result.pageInfo.endCursor;
    }
    return threads;
  };

  /** Fetch a file's UTF-8 content: the resource block of get_file_contents. */
  const getFileContent = async (
    gh: GithubSession,
    repo: string,
    path: string,
    ref: string,
  ): Promise<string> => {
    const content = await gh.callContent('get_file_contents', {
      ...splitRepo(repo),
      path,
      ...(gitRef(ref) && { ref: gitRef(ref) }),
    });
    const resource = content.find(item => item.type === 'resource')?.resource;
    if (resource?.text !== undefined) {
      return resource.text;
    }
    // A directory answers with a listing in the text block; a file always
    // carries its content as a resource.
    const text = content.find(item => item.type === 'text')?.text ?? '';
    if (text.trim().startsWith('[')) {
      throw new InputError(`'${path}' is not a file`);
    }
    throw new Error(`No content returned for ${path}@${ref}`);
  };

  interface TreeEntry {
    path: string;
    type: 'blob' | 'tree';
    size?: number;
  }

  /**
   * The recursive tree of a ref, walked directory by directory: the GitHub
   * MCP server lists one directory per call (trailing slash), the root as `/`.
   */
  const getTree = async (
    gh: GithubSession,
    repo: string,
    ref: string,
  ): Promise<{ truncated: boolean; tree: TreeEntry[] }> => {
    const tree: TreeEntry[] = [];
    let truncated = false;
    let dirs = [''];
    for (let depth = 0; depth < TREE_MAX_DEPTH && dirs.length > 0; depth++) {
      const listings = await Promise.all(
        dirs.map(dir =>
          gh.call<
            Array<{
              name?: string;
              path?: string;
              type?: string;
              size?: number;
            }>
          >('get_file_contents', {
            ...splitRepo(repo),
            path: dir === '' ? '/' : `${dir}/`,
            ...(gitRef(ref) && { ref: gitRef(ref) }),
            fields: ['name', 'path', 'type', 'size'],
          }),
        ),
      );
      const next: string[] = [];
      for (const entries of listings) {
        for (const entry of Array.isArray(entries) ? entries : []) {
          if (!entry.path) {
            continue;
          }
          if (tree.length >= TREE_MAX_ENTRIES) {
            truncated = true;
            break;
          }
          if (entry.type === 'dir') {
            tree.push({ path: entry.path, type: 'tree' });
            next.push(entry.path);
          } else {
            tree.push({ path: entry.path, type: 'blob', size: entry.size });
          }
        }
      }
      dirs = truncated ? [] : next;
    }
    if (dirs.length > 0) {
      truncated = true;
    }
    return { truncated, tree };
  };

  const parsePullNumber = (raw: string): number => {
    const pullNumber = parseInt(raw, 10);
    if (!Number.isInteger(pullNumber) || pullNumber <= 0) {
      throw new InputError('number must be a positive integer');
    }
    return pullNumber;
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

  /**
   * Whether the caller's muster session can reach GitHub, and the sign-in
   * URL when it cannot yet. Lets the frontend offer "Connect GitHub" before
   * the first failing request, and poll after the popup.
   */
  router.get('/connection', async (req, res) => {
    const login = await gateway().login(musterToken(req));
    if (login.status === 'connected') {
      res.json({ connected: true });
      return;
    }
    res.json({
      connected: false,
      authUrl: login.authUrl,
      message: login.message,
    });
  });

  router.get('/pulls', async (req, res) => {
    const repo = resolveRepo(req);
    const pulls = await listOpenPulls(githubFor(req), repo);

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
    const files = await listPullFiles(githubFor(req), repo, pullNumber);

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
    const comments = await githubFor(req).call<GithubComment[]>(
      'pull_request_read',
      {
        method: 'get_comments',
        ...splitRepo(repo),
        pullNumber,
        perPage: 100,
      },
    );

    res.json({ comments: (comments ?? []).map(mapComment) });
  });

  // Written as the caller, so GitHub shows them as the comment's author.
  router.post('/pulls/:number/comments', async (req, res) => {
    const repo = resolveRepo(req);
    const pullNumber = parsePullNumber(req.params.number);
    const body = requireBody(req);
    const created = await githubFor(req).call<GithubComment | string>(
      'add_issue_comment',
      { ...splitRepo(repo), issue_number: pullNumber, body },
    );

    const comment =
      created && typeof created === 'object' && 'body' in created
        ? mapComment(created)
        : { id: undefined, author: undefined, body, createdAt: undefined };
    res.status(201).json({ comment });
  });

  // Inline review comments on changed lines (GitHub pull review comments).
  router.get('/pulls/:number/review-comments', async (req, res) => {
    const repo = resolveRepo(req);
    const pullNumber = parsePullNumber(req.params.number);
    const threads = await listReviewThreads(githubFor(req), repo, pullNumber);

    res.json({ comments: flattenReviewThreads(threads) });
  });

  router.post('/pulls/:number/review-comments', async (req, res) => {
    const repo = resolveRepo(req);
    const pullNumber = parsePullNumber(req.params.number);
    const gh = githubFor(req);
    const body = requireBody(req);
    const target = splitRepo(repo);

    const { path, line, inReplyTo } = req.body ?? {};

    if (inReplyTo !== undefined) {
      if (!Number.isInteger(inReplyTo) || inReplyTo <= 0) {
        throw new InputError('inReplyTo must be a positive integer');
      }
      await gh.call('add_reply_to_pull_request_comment', {
        ...target,
        pullNumber,
        commentId: inReplyTo,
        body,
      });
    } else {
      if (typeof path !== 'string' || path === '') {
        throw new InputError('path must be a non-empty string');
      }
      if (!Number.isInteger(line) || line <= 0) {
        throw new InputError('line must be a positive integer');
      }
      // GitHub's MCP server only writes inline comments through a review:
      // open a pending one, add the comment, submit it as a plain comment.
      // A pending review left over from an interrupted attempt is reused.
      try {
        await gh.call('pull_request_review_write', {
          method: 'create',
          ...target,
          pullNumber,
        });
      } catch (error) {
        if (!/pending review/i.test(String(error))) {
          throw error;
        }
      }
      await gh.call('add_comment_to_pending_review', {
        ...target,
        pullNumber,
        path,
        line,
        side: 'RIGHT',
        subjectType: 'LINE',
        body,
      });
      await gh.call('pull_request_review_write', {
        method: 'submit_pending',
        ...target,
        pullNumber,
        event: 'COMMENT',
      });
    }

    // The write tools return no comment object; read the thread back so the
    // caller gets the created comment with its id.
    const comments = flattenReviewThreads(
      await listReviewThreads(gh, repo, pullNumber),
    );
    const created = [...comments]
      .reverse()
      .find(
        comment =>
          comment.body === body &&
          (inReplyTo !== undefined
            ? comment.inReplyTo === inReplyTo
            : comment.path === path && comment.line === line),
      ) ?? {
      id: undefined,
      author: undefined,
      body,
      createdAt: undefined,
      htmlUrl: undefined,
      path,
      line,
      side: 'RIGHT',
      inReplyTo,
    };

    res.status(201).json({ comment: created });
  });

  router.get('/tree', async (req, res) => {
    const repo = resolveRepo(req);
    // HEAD resolves to the repository's default branch on the GitHub side.
    const ref = singleQueryValue(req.query.ref, 'ref') ?? 'HEAD';
    res.json(await getTree(githubFor(req), repo, ref));
  });

  router.get('/content', async (req, res) => {
    const repo = resolveRepo(req);
    const ref = singleQueryValue(req.query.ref, 'ref') ?? 'HEAD';
    const path = singleQueryValue(req.query.path, 'path');
    if (!path) {
      throw new InputError('path query parameter is required');
    }
    res.json({
      path,
      ref,
      content: await getFileContent(githubFor(req), repo, path, ref),
    });
  });

  const epicsCache = new Map<string, { expires: number; data: unknown }>();

  /**
   * The epic each plan references, for cross-linking plans with the roadmap
   * board: merged plans scanned on the default branch, proposed plans parsed
   * from their PR diffs. The crawl runs as the requesting caller; the result
   * is cached per repository since it describes the repository, not the
   * caller.
   */
  router.get('/epics', async (req, res) => {
    const repo = resolveRepo(req);
    const hit = epicsCache.get(repo);
    if (hit && hit.expires > Date.now()) {
      res.json(hit.data);
      return;
    }
    const gh = githubFor(req);

    // Merged plans: scan each plan folder's direct-child markdown files
    // (PRD.md first) until one carries an Epic header.
    const { tree } = await getTree(gh, repo, 'HEAD');
    const byFolder = new Map<string, string[]>();
    for (const entry of tree) {
      if (entry.type !== 'blob' || !isPlanDoc(entry.path)) {
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
              await getFileContent(gh, repo, path, 'HEAD').catch(() => ''),
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
    const openPulls = await listOpenPulls(gh, repo);
    const pulls = (
      await Promise.all(
        openPulls.map(async pull => {
          const files = await listPullFiles(gh, repo, pull.number);
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

  // A missing GitHub grant is a 401 that carries the sign-in URL; GitHub's
  // own refusals (no access to the repository, a permission the person's
  // grant lacks) are 403s, so neither pages us as a server fault.
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
      if (
        error instanceof Error &&
        /\b403\b|forbidden|resource not accessible/i.test(error.message)
      ) {
        next(new NotAllowedError(error.message));
        return;
      }
      if (error instanceof Error && /\b404\b|not found/i.test(error.message)) {
        next(new NotFoundError(error.message));
        return;
      }
      next(error);
    },
  );

  return router;
}
