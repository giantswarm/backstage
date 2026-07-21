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

/**
 * Targeted lookup for one issue's board item -- the single-select and
 * iteration field values are all the cross-link chip needs.
 */
const ISSUE_PROJECT_ITEM_QUERY = `
  query IssueProjectItem($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      issue(number: $number) {
        title
        url
        state
        assignees(first: 10) {
          nodes { login }
        }
        projectItems(first: 20, includeArchived: false) {
          nodes {
            id
            project { id }
            fieldValues(first: 30) {
              nodes {
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                  field { ... on ProjectV2FieldCommon { name } }
                }
                ... on ProjectV2ItemFieldIterationValue {
                  title
                  field { ... on ProjectV2FieldCommon { name } }
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Board items and sub-issue trees: five minutes is fresh enough for other
 * people's changes (the caller's own writes patch the cache immediately),
 * and the cache is served stale-while-revalidate anyway.
 */
const ITEMS_TTL_MS = 5 * 60_000;
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
  /** Disable the startup/interval cache warming (tests only). */
  warmCache?: boolean;
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
    // User tokens are GitHub App user-to-server tokens, so they are capped
    // by the auth App's own permissions -- this error means the App itself
    // lacks org Projects write, not that the user does.
    if (/Resource not accessible by integration/i.test(message)) {
      throw new NotAllowedError(
        `GitHub rejected the request: ${message}. The portal's GitHub auth ` +
          'App is missing the "Projects: Read and write" organization ' +
          'permission; it must be granted on the App and approved for the org.',
      );
    }
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

  // Board reads paginate the full project (~430 items for one team is five
  // sequential GraphQL pages, >10s), so the cache is stale-while-revalidate:
  // an expired entry is served immediately while one background refresh per
  // key brings it up to date. Only a cold key ever blocks on GitHub.
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
      // Serve stale, let the refresh land in the background.
      refresh.catch(() => {});
      return hit.data as T;
    }
    return refresh;
  };

  const itemsListOptions = (
    filters: Record<string, string>,
    query: Partial<
      Record<'assignee' | 'state' | 'updated' | 'keyword', string>
    > & {
      repository?: string;
    } = {},
  ) => ({
    filters,
    assignee: query.assignee ?? null,
    state: query.state ?? null,
    updated: query.updated ?? null,
    repository: query.repository ?? null,
    keyword: query.keyword ?? null,
  });

  const listItemsCached = async (
    listOptions: ReturnType<typeof itemsListOptions>,
  ): Promise<ProListItem[]> => {
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

  /**
   * After a successful field write, update the item inside every cached
   * list and drop its cached detail -- instead of clearing the cache, which
   * would force the next board load into a full multi-page rescan.
   */
  const patchCachedItem = (itemId: string, name: string, value: string) => {
    for (const [key, entry] of cache) {
      if (key.startsWith('items:')) {
        const result = entry.data as { data?: ProListItem[] };
        for (const item of result.data ?? []) {
          if (item.id === itemId) {
            item.fields = { ...item.fields, [name]: value };
          }
        }
      }
    }
    cache.delete(`item:${itemId}`);
  };

  const dropSubIssueCaches = () => {
    for (const key of cache.keys()) {
      if (key.startsWith('sub-issues:')) {
        cache.delete(key);
      }
    }
  };

  // Warm the default board view (and keep it warm) so the first visitor
  // after a pod restart -- deploys are frequent -- doesn't pay the cold
  // multi-page scan. With stale-while-revalidate above, this makes board
  // loads effectively instant for everyone.
  if (enabled && (options.warmCache ?? true)) {
    const warm = () => {
      const filters: Record<string, string> = defaultTeams[0]
        ? { team: defaultTeams[0] }
        : {};
      listItemsCached(itemsListOptions(filters)).catch(error =>
        logger.warn(`Roadmap cache warming failed: ${error}`),
      );
    };
    warm();
    setInterval(warm, ITEMS_TTL_MS).unref();
  }

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

    const items = await listItemsCached(
      itemsListOptions(filters, {
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
      filters.team = team;
    }
    const items = await listItemsCached(itemsListOptions(filters));

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
   * the plans plugin. A targeted issue->projectItems query: one GraphQL
   * call instead of paginating the whole board (~2000 items, ~1min).
   */
  router.get('/items/by-issue/:owner/:repo/:number', async (req, res) => {
    const number = parsePositiveInt(req.params.number, 'number');
    const { owner, repo } = req.params;
    const item = await cached(
      `by-issue:${owner}/${repo}#${number}`,
      ITEMS_TTL_MS,
      () =>
        mapGithubError(async () => {
          const result = await pro.graphQLWithAuth<{
            repository?: {
              issue?: {
                title: string;
                url: string;
                state: string;
                assignees?: { nodes?: Array<{ login: string }> };
                projectItems?: {
                  nodes?: Array<{
                    id: string;
                    project?: { id: string };
                    fieldValues?: {
                      nodes?: Array<{
                        name?: string;
                        title?: string;
                        field?: { name?: string };
                      }>;
                    };
                  } | null>;
                };
              } | null;
            } | null;
          }>(
            ISSUE_PROJECT_ITEM_QUERY,
            { owner, repo, number },
            await appToken(),
          );
          const issue = result.repository?.issue;
          const node = issue?.projectItems?.nodes?.find(
            projectItem => projectItem?.project?.id === boardId,
          );
          if (!issue || !node) {
            return null;
          }
          const fields: Record<string, string> = {};
          for (const fieldValue of node.fieldValues?.nodes ?? []) {
            const value = fieldValue?.name ?? fieldValue?.title;
            if (fieldValue?.field?.name && value) {
              fields[fieldValue.field.name] = value;
            }
          }
          return {
            id: node.id,
            title: issue.title,
            number,
            url: issue.url,
            repo: `${owner}/${repo}`,
            state: issue.state,
            assignees: (issue.assignees?.nodes ?? []).map(a => a.login),
            fields,
          };
        }),
    );
    if (!item) {
      throw new NotFoundError(
        `No board item found for issue ${owner}/${repo}#${number}`,
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
    let canonicalValue = value;
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
      canonicalValue = option.name;
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
      canonicalValue = iteration.title;
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
    patchCachedItem(req.params.id, field.name, canonicalValue);
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
    dropSubIssueCaches();
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
      dropSubIssueCaches();
      logger.info(
        `Unlinked sub-issue ${target.subIssueId} from ${target.owner}/${target.repo}#${target.issue_number}`,
      );
      res.status(204).end();
    },
  );

  return router;
}
