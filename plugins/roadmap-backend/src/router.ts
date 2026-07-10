import { HttpAuthService, LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import {
  AuthenticationError,
  InputError,
  NotAllowedError,
  NotFoundError,
  ServiceUnavailableError,
} from '@backstage/errors';
import { GithubCredentialsProvider } from '@backstage/integration';
import express from 'express';
import Router from 'express-promise-router';
import type * as ProModule from '@giantswarm-io/pro';
import type { ProField, ProListItem, ProRestIssue } from '@giantswarm-io/pro';

const GITHUB_ORG_URL = 'https://github.com/giantswarm';

/** Board items and sub-issue trees change often; keep reads fresh. */
const ITEMS_TTL_MS = 60_000;
/** The board schema (fields/options) rarely changes. */
const SCHEMA_TTL_MS = 10 * 60_000;

export interface RouterOptions {
  logger: LoggerService;
  config: Config;
  httpAuth: HttpAuthService;
  credentialsProvider: GithubCredentialsProvider;
  /**
   * The `@giantswarm-io/pro` module. Injected (instead of imported here)
   * because the package is ESM-only while this plugin compiles to CJS --
   * the plugin init loads it with a dynamic import. Also the seam for tests.
   */
  pro: typeof ProModule;
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

/** Compact field description for the frontend's filter UI. */
function mapField(field: ProField) {
  let type: 'singleSelect' | 'iteration' | 'date' | 'text' | 'other' = 'other';
  if (field.__typename === 'ProjectV2SingleSelectField') {
    type = 'singleSelect';
  } else if (field.__typename === 'ProjectV2IterationField') {
    type = 'iteration';
  } else if (field.__typename === 'ProjectV2Field') {
    type = field.dataType === 'DATE' ? 'date' : 'text';
  }
  return {
    name: field.name,
    type,
    options: field.options?.map(option => option.name),
    iterations: field.configuration?.iterations?.map(
      iteration => iteration.title,
    ),
  };
}

function mapRestIssue(issue: ProRestIssue) {
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    state: issue.state,
    htmlUrl: issue.html_url,
    assignees: (issue.assignees ?? []).map(assignee => assignee.login),
    // 'https://api.github.com/repos/giantswarm/giantswarm' -> 'giantswarm/giantswarm'
    repo: issue.repository_url?.split('/repos/').pop(),
  };
}

/**
 * Map GitHub client failures (Octokit RequestError `status`, GraphQL
 * FORBIDDEN/NOT_FOUND) to @backstage/errors classes so the root error
 * middleware turns them into meaningful status codes instead of 500s.
 * A 401/403 on a write is the caller's GitHub token lacking scope or
 * project permission -- an actionable client error, not a server fault.
 */
async function mapGithubError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const status = (error as { status?: number }).status;
    const message = (error as Error).message ?? String(error);
    if (status === 401 || status === 403 || /FORBIDDEN/.test(message)) {
      throw new NotAllowedError(`GitHub rejected the request: ${message}`);
    }
    if (status === 404 || /NOT_FOUND|Could not resolve/.test(message)) {
      throw new NotFoundError(`GitHub resource not found: ${message}`);
    }
    throw error;
  }
}

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, config, httpAuth, credentialsProvider, pro } = options;

  // The plugin ships in every portal image, but the roadmap board is
  // internal: only portals that set `roadmap.board` serve it. Same opt-in
  // mechanism as plans-backend (no config -> 503).
  const boardKey = config.getOptionalString('roadmap.board');
  const enabled = boardKey !== undefined;
  if (!enabled) {
    logger.info(
      'No roadmap board configured (set roadmap.board); roadmap endpoints will return 503.',
    );
  }
  const boardId = boardKey !== undefined ? pro.resolveBoardId(boardKey) : '';
  const defaultTeams = config.getOptionalStringArray('roadmap.teams') ?? [];

  /** Shared GitHub App installation token -- used for all reads. */
  const appToken = async (): Promise<string> => {
    const { token } = await credentialsProvider.getCredentials({
      url: GITHUB_ORG_URL,
    });
    if (!token) {
      throw new Error(
        'No GitHub credentials available for the giantswarm org; check the integrations config.',
      );
    }
    return token;
  };

  /**
   * Per-user GitHub OAuth token -- required for all writes so board
   * mutations are attributed to the person who made them. Never falls
   * back to the App token.
   */
  const userToken = (req: express.Request): string => {
    const token = req.header('x-github-token');
    if (!token) {
      throw new AuthenticationError(
        'Board mutations require a per-user GitHub token in the X-GitHub-Token header.',
      );
    }
    return token;
  };

  // Board reads paginate the full project, so identical requests within the
  // TTL share one result. Writes clear the cache so their effect is visible
  // immediately.
  const cache = new Map<string, { expires: number; data: unknown }>();
  const cached = async <T>(
    key: string,
    ttlMs: number,
    load: () => Promise<T>,
  ): Promise<T> => {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) {
      return hit.data as T;
    }
    const data = await load();
    cache.set(key, { expires: Date.now() + ttlMs, data });
    return data;
  };

  const listItemsCached = async (listOptions: {
    filters: Record<string, string>;
    assignee?: string | null;
    state?: string | null;
    updated?: string | null;
    repository?: string | null;
    keyword?: string | null;
  }): Promise<ProListItem[]> => {
    const cacheKey = `items:${JSON.stringify(listOptions)}`;
    const result = await cached(cacheKey, ITEMS_TTL_MS, async () =>
      pro.listItems({ boardId, ...listOptions, token: await appToken() }),
    );
    if (result.status !== 'success') {
      // pro returns status:'error' for invalid filter fields/values.
      throw new InputError(result.error ?? 'Failed to list board items');
    }
    return result.data ?? [];
  };

  const router = Router();
  router.use(express.json());

  // All routes serve private-repo content; require a Backstage user.
  router.use(async (req, _res, next) => {
    await httpAuth.credentials(req, { allow: ['user'] });
    if (!enabled) {
      throw new ServiceUnavailableError(
        'The roadmap plugin is not configured on this portal. Set roadmap.board.',
      );
    }
    next();
  });

  router.get('/schema', async (_req, res) => {
    const fields = await cached('schema', SCHEMA_TTL_MS, async () =>
      (await pro.listFields(boardId, await appToken())).map(mapField),
    );
    res.json({ board: boardKey, defaultTeams, fields });
  });

  router.get('/items', async (req, res) => {
    const filters: Record<string, string> = {};
    for (const fieldName of ['team', 'status', 'kind', 'availability']) {
      const value = singleQueryValue(req.query[fieldName], fieldName);
      if (value) {
        filters[fieldName] = value;
      }
    }

    // Quarter is an iteration field, which pro's generic `filters` map
    // (single-select only) cannot express. GitHub Projects' server-side
    // query syntax can, so it travels as a keyword term.
    const keywordTerms: string[] = [];
    const quarter = singleQueryValue(req.query.quarter, 'quarter');
    if (quarter) {
      keywordTerms.push(`quarter:"${quarter.replace(/"/g, '')}"`);
    }
    const keyword = singleQueryValue(req.query.keyword, 'keyword');
    if (keyword) {
      keywordTerms.push(keyword);
    }

    const items = await listItemsCached({
      filters,
      assignee: singleQueryValue(req.query.assignee, 'assignee') ?? null,
      state: singleQueryValue(req.query.state, 'state') ?? null,
      updated: singleQueryValue(req.query.updated, 'updated') ?? null,
      repository: singleQueryValue(req.query.repository, 'repository') ?? null,
      keyword: keywordTerms.length > 0 ? keywordTerms.join(' ') : null,
    });
    res.json({ items });
  });

  router.get('/overview', async (req, res) => {
    const filters: Record<string, string> = {};
    const team = singleQueryValue(req.query.team, 'team');
    if (team) {
      filters.team = team;
    }
    const items = await listItemsCached({ filters });

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
   * Resolve a GitHub issue reference to its board item. Plan documents
   * reference epics as `owner/repo#N`, but the detail route needs the
   * Projects v2 item node id -- this is the bridge for cross-links from
   * the plans plugin.
   */
  router.get('/items/by-issue/:owner/:repo/:number', async (req, res) => {
    const number = parsePositiveInt(req.params.number, 'number');
    const repoSlug = `${req.params.owner}/${req.params.repo}`;
    const items = await listItemsCached({ filters: {} });
    const item = items.find(
      boardItem => boardItem.repo === repoSlug && boardItem.number === number,
    );
    if (!item) {
      throw new NotFoundError(
        `No board item found for issue ${repoSlug}#${number}`,
      );
    }
    res.json({ item });
  });

  router.get('/items/:id', async (req, res) => {
    const item = await cached(`item:${req.params.id}`, ITEMS_TTL_MS, () =>
      mapGithubError(async () =>
        pro.getItemByID(req.params.id, await appToken()),
      ),
    );
    res.json({ item });
  });

  router.get('/issues/:owner/:repo/:number/sub-issues', async (req, res) => {
    const target = {
      owner: req.params.owner,
      repo: req.params.repo,
      issue_number: parsePositiveInt(req.params.number, 'number'),
    };
    const [subIssues, parent] = await cached(
      `sub-issues:${target.owner}/${target.repo}#${target.issue_number}`,
      ITEMS_TTL_MS,
      () =>
        mapGithubError(async () => {
          const token = await appToken();
          return Promise.all([
            pro.listSubIssues({ ...target, per_page: 100 }, token),
            pro.getParentIssue(target, token),
          ]);
        }),
    );
    res.json({
      subIssues: subIssues.map(mapRestIssue),
      parent: parent ? mapRestIssue(parent) : null,
    });
  });

  router.patch('/items/:id/field', async (req, res) => {
    const token = userToken(req);
    const { name, value } = req.body ?? {};
    if (typeof name !== 'string' || name.trim() === '') {
      throw new InputError('name must be a non-empty string');
    }
    if (typeof value !== 'string' || value.trim() === '') {
      throw new InputError('value must be a non-empty string');
    }

    // Resolve the human-readable field name and option value to the node
    // IDs the mutation needs. Field lookup runs with the caller's token
    // too, so a caller who cannot read the board cannot mutate it either.
    const field = await mapGithubError(() =>
      pro.findFieldByName(name, boardId, token),
    );
    if (!field) {
      throw new InputError(
        `Field '${name}' not found on the ${boardKey} board or not updatable`,
      );
    }

    let mutationValue: Record<string, string>;
    if (field.__typename === 'ProjectV2SingleSelectField') {
      const option = pro.findMatchingOption(field.options ?? [], value);
      if (!option) {
        const available = (field.options ?? [])
          .map(fieldOption => fieldOption.name)
          .join(', ');
        throw new InputError(
          `Value '${value}' not found for field '${field.name}'. Available options: ${available}`,
        );
      }
      mutationValue = { singleSelectOptionId: option.id };
    } else if (field.__typename === 'ProjectV2IterationField') {
      const iteration = pro.findMatchingIteration(field, value);
      if (!iteration) {
        const available = (field.configuration?.iterations ?? [])
          .map(fieldIteration => fieldIteration.title)
          .join(', ');
        throw new InputError(
          `Iteration '${value}' not found for field '${field.name}'. Available iterations: ${available}`,
        );
      }
      mutationValue = { iterationId: iteration.id };
    } else if (field.dataType === 'DATE') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new InputError(
          `Invalid date '${value}' for field '${field.name}'; expected YYYY-MM-DD`,
        );
      }
      mutationValue = { date: value };
    } else {
      throw new InputError(
        `Field '${field.name}' has unsupported type '${field.__typename}' for updates`,
      );
    }

    await mapGithubError(() =>
      pro.updateItemField(
        req.params.id,
        field.id,
        mutationValue,
        boardId,
        token,
      ),
    );
    cache.clear();
    logger.info(`Updated field '${field.name}' on item ${req.params.id}`);
    res.json({ status: 'ok' });
  });

  router.post('/issues/:owner/:repo/:number/sub-issues', async (req, res) => {
    const token = userToken(req);
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

    // The sub-issues API wants the child's integer issue ID, not its number.
    const resolved = await mapGithubError(() =>
      pro.resolveIssueId(child, { token }),
    );
    const parent = await mapGithubError(() =>
      pro.addSubIssue({ ...target, subIssueId: resolved.id }, token),
    );
    cache.clear();
    logger.info(
      `Linked ${child} as sub-issue of ${target.owner}/${target.repo}#${target.issue_number}`,
    );
    res.status(201).json({ parent: mapRestIssue(parent) });
  });

  router.delete(
    '/issues/:owner/:repo/:number/sub-issues/:subIssueId',
    async (req, res) => {
      const token = userToken(req);
      const target = {
        owner: req.params.owner,
        repo: req.params.repo,
        issue_number: parsePositiveInt(req.params.number, 'number'),
        subIssueId: parsePositiveInt(req.params.subIssueId, 'subIssueId'),
      };
      await mapGithubError(() => pro.removeSubIssue(target, token));
      cache.clear();
      logger.info(
        `Unlinked sub-issue ${target.subIssueId} from ${target.owner}/${target.repo}#${target.issue_number}`,
      );
      res.status(204).end();
    },
  );

  return router;
}
