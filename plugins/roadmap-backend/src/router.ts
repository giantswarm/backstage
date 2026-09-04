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

/**
 * Board reads paginate the full project (~430 items for one team is five
 * sequential GraphQL pages, >10s), so results are cached per person --
 * every read runs with the caller's own GitHub grant -- and served
 * stale-while-revalidate: an expired entry is answered immediately while one
 * background refresh per key brings it up to date.
 */
const ITEMS_TTL_MS = 5 * 60_000;
/** The board schema (fields/options) rarely changes. */
const SCHEMA_TTL_MS = 10 * 60_000;

export interface RouterOptions {
  logger: LoggerService;
  config: Config;
  httpAuth: HttpAuthService;
  /** pro's board tools, through muster, as the caller; undefined when unconfigured. */
  pro?: MusterServerGateway;
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

function parsePositiveInt(raw: string, name: string): number {
  const value = parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new InputError(`${name} must be a positive integer`);
  }
  return value;
}

/** A board item as pro's `list_issues` returns it. */
export interface BoardItem {
  id: string;
  title: string;
  number?: number;
  url?: string;
  repo: string | null;
  private?: boolean | null;
  state?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  closedAt?: string;
  assignees?: string[];
  labels?: string[];
  fields: Record<string, string>;
}

/** An issue as pro's sub-issue tools return it (`compactIssue`). */
interface ProCompactIssue {
  id?: number;
  number: number;
  title: string;
  url?: string;
  state?: string;
  repository?: string;
  assignees?: string[];
}

function mapIssue(issue: ProCompactIssue) {
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    state: issue.state,
    htmlUrl: issue.url,
    assignees: issue.assignees ?? [],
    repo: issue.repository,
  };
}

/** The board filter names pro knows, from the frontend's lowercase keys. */
const FILTER_FIELDS: Record<string, string> = {
  team: 'Team',
  status: 'Status',
  kind: 'Kind',
  availability: 'Availability',
};

/**
 * pro answers a GitHub refusal with its message; map the ones a person can
 * act on to a 403/404 so the client shows them instead of a server fault.
 */
function mapProError(error: unknown): unknown {
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
      `GitHub rejected the request: ${message}. Your GitHub account, or the GitHub App muster connects with, lacks a permission on this repository or board.`,
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
  const { logger, config, httpAuth, pro } = options;

  // The plugin ships in every portal image, but the roadmap board is
  // internal: only portals that set `roadmap.board` serve it. Same opt-in
  // mechanism as plans-backend (no config -> 503).
  const boardKey = config.getOptionalString('roadmap.board');
  const enabled = boardKey !== undefined && pro !== undefined;
  if (boardKey === undefined) {
    logger.info(
      'No roadmap board configured (set roadmap.board); roadmap endpoints will return 503.',
    );
  }
  if (!pro) {
    logger.info(
      'No muster pro server configured (set roadmap.muster); roadmap endpoints will return 503.',
    );
  }
  const board = boardKey ?? '';
  const defaultTeams = config.getOptionalStringArray('roadmap.teams') ?? [];

  const gateway = (): MusterServerGateway => {
    if (!pro) {
      throw new ServiceUnavailableError(
        'The roadmap plugin is not configured on this portal. Set roadmap.muster.',
      );
    }
    return pro;
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
        `Roadmap requests need the caller's muster token in the ${MUSTER_AUTH_HEADER} header.`,
      );
    }
    return token;
  };

  /** A pro session for one request: every tool runs as the caller. */
  const proFor = (req: express.Request) => {
    const gh = gateway();
    const token = musterToken(req);
    const call = <T>(tool: string, args: Record<string, unknown>) =>
      asConnected(gh, gh.server, token, async () => {
        try {
          return (await gh.call(tool, args, token)) as T;
        } catch (error) {
          throw mapProError(error);
        }
      });
    return { call, user: String(req.res?.locals.userRef ?? 'anonymous') };
  };

  type ProSession = ReturnType<typeof proFor>;

  // Per-person caches: entries are keyed by the caller's identity, since
  // every read carries their own grant and sees their own view of GitHub.
  const cache = new Map<string, { expires: number; data: unknown }>();
  const inflight = new Map<string, Promise<unknown>>();
  const cached = async <T>(
    key: string,
    ttlMs: number,
    load: () => Promise<T>,
  ): Promise<T> => {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) {
      return hit.data as T;
    }
    let refresh = inflight.get(key) as Promise<T> | undefined;
    if (!refresh) {
      refresh = load().then(
        data => {
          cache.set(key, { expires: Date.now() + ttlMs, data });
          inflight.delete(key);
          return data;
        },
        error => {
          inflight.delete(key);
          throw error;
        },
      );
      inflight.set(key, refresh);
    }
    if (hit) {
      refresh.catch(() => {});
      return hit.data as T;
    }
    return refresh;
  };

  const itemsListArgs = (
    filters: Record<string, string>,
    query: Partial<
      Record<
        'assignee' | 'state' | 'updated' | 'keyword' | 'repository',
        string
      >
    > = {},
  ): Record<string, unknown> => {
    const args: Record<string, unknown> = { board, filters };
    for (const key of [
      'assignee',
      'state',
      'updated',
      'keyword',
      'repository',
    ] as const) {
      if (query[key]) {
        args[key] = query[key];
      }
    }
    return args;
  };

  const listItemsCached = async (
    session: ProSession,
    args: Record<string, unknown>,
  ): Promise<BoardItem[]> => {
    const result = await cached(
      `${session.user}:items:${JSON.stringify(args)}`,
      ITEMS_TTL_MS,
      () => session.call<{ issues?: BoardItem[] }>('list_issues', args),
    );
    return result.issues ?? [];
  };

  /**
   * Apply a field write to the person's cached lists in place, so the next
   * read reflects it without a rescan; drop their cached item detail.
   */
  const patchCachedItem = (
    user: string,
    itemId: string,
    name: string,
    value: string,
  ) => {
    for (const [key, entry] of cache) {
      if (key.startsWith(`${user}:items:`)) {
        const result = entry.data as { issues?: BoardItem[] };
        for (const item of result.issues ?? []) {
          if (item.id === itemId) {
            item.fields = { ...item.fields, [name]: value };
          }
        }
      }
    }
    cache.delete(`${user}:item:${itemId}`);
  };

  const dropSubIssueCaches = (user: string) => {
    for (const key of cache.keys()) {
      if (key.startsWith(`${user}:sub-issues:`)) {
        cache.delete(key);
      }
    }
  };

  const router = Router();
  router.use(express.json());

  router.use(async (req, res, next) => {
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    res.locals.userRef = credentials.principal.userEntityRef;
    if (!enabled) {
      throw new ServiceUnavailableError(
        'The roadmap plugin is not configured on this portal. Set roadmap.board and roadmap.muster.',
      );
    }
    next();
  });

  /**
   * Whether the caller's muster session can reach the board, and the sign-in
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

  router.get('/schema', async (req, res) => {
    const session = proFor(req);
    const fields = await cached(
      `${session.user}:schema`,
      SCHEMA_TTL_MS,
      async () =>
        (
          await session.call<{
            fields?: Array<{
              name: string;
              type: string;
              options?: string[];
              iterations?: string[];
            }>;
          }>('get_board_schema', { board })
        ).fields ?? [],
    );
    res.json({ board: boardKey, defaultTeams, fields });
  });

  router.get('/items', async (req, res) => {
    const filters: Record<string, string> = {};
    for (const [param, fieldName] of Object.entries(FILTER_FIELDS)) {
      const value = singleQueryValue(req.query[param], param);
      if (value) {
        filters[fieldName] = value;
      }
    }

    const keywordTerms: string[] = [];
    const quarter = singleQueryValue(req.query.quarter, 'quarter');
    if (quarter) {
      keywordTerms.push(`quarter:"${quarter.replace(/"/g, '')}"`);
    }
    const keyword = singleQueryValue(req.query.keyword, 'keyword');
    if (keyword) {
      keywordTerms.push(keyword);
    }

    const items = await listItemsCached(
      proFor(req),
      itemsListArgs(filters, {
        assignee: singleQueryValue(req.query.assignee, 'assignee'),
        state: singleQueryValue(req.query.state, 'state'),
        updated: singleQueryValue(req.query.updated, 'updated'),
        repository: singleQueryValue(req.query.repository, 'repository'),
        keyword: keywordTerms.length > 0 ? keywordTerms.join(' ') : undefined,
      }),
    );
    res.json({ items });
  });

  router.get('/overview', async (req, res) => {
    const filters: Record<string, string> = {};
    const team = singleQueryValue(req.query.team, 'team');
    if (team) {
      filters.Team = team;
    }
    const items = await listItemsCached(proFor(req), itemsListArgs(filters));

    const byStatus: Record<string, number> = {};
    const byRepo: Record<string, number> = {};
    for (const item of items) {
      const status = item.fields.Status ?? 'No status';
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      const repo = item.repo ?? 'unknown';
      byRepo[repo] = (byRepo[repo] ?? 0) + 1;
    }
    res.json({ total: items.length, byStatus, byRepo });
  });

  /**
   * The board item of an issue, for cross-links (a plan's epic): one targeted
   * lookup in pro, not a board scan.
   */
  router.get('/items/by-issue/:owner/:repo/:number', async (req, res) => {
    const number = parsePositiveInt(req.params.number, 'number');
    const { owner, repo } = req.params;
    const session = proFor(req);
    const item = await cached(
      `${session.user}:by-issue:${owner}/${repo}#${number}`,
      ITEMS_TTL_MS,
      async () =>
        (
          await session.call<{ item?: BoardItem | null }>('get_item_by_issue', {
            board,
            owner,
            repo,
            issue_number: number,
          })
        ).item ?? null,
    );
    if (!item) {
      throw new NotFoundError(
        `No board item found for issue ${owner}/${repo}#${number}`,
      );
    }
    res.json({ item });
  });

  router.get('/items/:id', async (req, res) => {
    const session = proFor(req);
    const item = await cached(
      `${session.user}:item:${req.params.id}`,
      ITEMS_TTL_MS,
      () =>
        session.call<unknown>('get_issue_details', { itemId: req.params.id }),
    );
    res.json({ item });
  });

  router.get('/issues/:owner/:repo/:number/sub-issues', async (req, res) => {
    const target = {
      owner: req.params.owner,
      repo: req.params.repo,
      issue_number: parsePositiveInt(req.params.number, 'number'),
    };
    const session = proFor(req);
    const [subIssues, parent] = await cached(
      `${session.user}:sub-issues:${target.owner}/${target.repo}#${target.issue_number}`,
      ITEMS_TTL_MS,
      () =>
        Promise.all([
          session
            .call<{ sub_issues?: ProCompactIssue[] }>('list_sub_issues', {
              ...target,
              per_page: 100,
            })
            .then(result => result.sub_issues ?? []),
          session
            .call<{ parent?: ProCompactIssue | null }>(
              'get_parent_issue',
              target,
            )
            .then(result => result.parent ?? null),
        ]),
    );
    res.json({
      subIssues: subIssues.map(mapIssue),
      parent: parent ? mapIssue(parent) : null,
    });
  });

  router.patch('/items/:id/field', async (req, res) => {
    const session = proFor(req);
    const { name, value } = req.body ?? {};
    if (typeof name !== 'string' || name.trim() === '') {
      throw new InputError('name must be a non-empty string');
    }
    if (typeof value !== 'string' || value.trim() === '') {
      throw new InputError('value must be a non-empty string');
    }

    // pro resolves the option / iteration / date itself and refuses unknown
    // values with the available ones -- surfaced to the client as a 400.
    let result: { success?: boolean; field?: string; value?: string };
    try {
      result = await session.call('update_issue_field', {
        board,
        itemId: req.params.id,
        fieldName: name,
        value,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        /not found|Available|Invalid date|unsupported type/i.test(
          error.message,
        ) &&
        !(error instanceof MusterServerNotConnectedError)
      ) {
        throw new InputError(error.message);
      }
      throw error;
    }
    patchCachedItem(
      session.user,
      req.params.id,
      result.field ?? name,
      result.value ?? value,
    );
    logger.info(
      `Updated field '${result.field ?? name}' on item ${req.params.id}`,
    );
    res.json({ status: 'ok' });
  });

  router.post('/issues/:owner/:repo/:number/sub-issues', async (req, res) => {
    const session = proFor(req);
    const target = {
      owner: req.params.owner,
      repo: req.params.repo,
      issue_number: parsePositiveInt(req.params.number, 'number'),
    };
    const child = req.body?.child;
    if (typeof child !== 'string' || child.trim() === '') {
      throw new InputError(
        'child must be an issue URL or owner/repo#N reference',
      );
    }

    const result = await session.call<{ parent?: ProCompactIssue }>(
      'add_sub_issue',
      { ...target, subIssueUrl: child },
    );
    dropSubIssueCaches(session.user);
    logger.info(
      `Linked ${child} as sub-issue of ${target.owner}/${target.repo}#${target.issue_number}`,
    );
    res
      .status(201)
      .json({ parent: result.parent ? mapIssue(result.parent) : null });
  });

  router.delete(
    '/issues/:owner/:repo/:number/sub-issues/:subIssueId',
    async (req, res) => {
      const session = proFor(req);
      const target = {
        owner: req.params.owner,
        repo: req.params.repo,
        issue_number: parsePositiveInt(req.params.number, 'number'),
        subIssueId: parsePositiveInt(req.params.subIssueId, 'subIssueId'),
      };
      await session.call('remove_sub_issue', target);
      dropSubIssueCaches(session.user);
      logger.info(
        `Unlinked sub-issue ${target.subIssueId} from ${target.owner}/${target.repo}#${target.issue_number}`,
      );
      res.status(204).end();
    },
  );

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
