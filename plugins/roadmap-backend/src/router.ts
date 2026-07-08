import { HttpAuthService, LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import {
  AuthenticationError,
  InputError,
  NotFoundError,
} from '@backstage/errors';
import { GithubCredentialsProvider } from '@backstage/integration';
import express from 'express';
import Router from 'express-promise-router';

import { ProApi, ProBoardField, ProRestIssue } from './proApi';

export interface RouterOptions {
  logger: LoggerService;
  config: Config;
  httpAuth: HttpAuthService;
  credentialsProvider: GithubCredentialsProvider;
  pro: ProApi;
}

/** Cache TTLs: board items change often, the field schema rarely. */
const ITEMS_TTL_MS = 60_000;
const SCHEMA_TTL_MS = 10 * 60_000;

const GITHUB_ORG_URL = 'https://github.com/giantswarm';

function singleQueryValue(value: unknown, name: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new InputError(`${name} must be provided at most once`);
  }
  return value;
}

/** Map a board field to the compact schema shape served to the frontend. */
function mapField(field: ProBoardField) {
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

/** Map a GitHub REST issue to the compact sub-issue shape. */
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

export async function createRouter(
  options: RouterOptions,
): Promise<express.Router> {
  const { logger, config, httpAuth, credentialsProvider, pro } = options;

  const boardKey = config.getOptionalString('roadmap.board') ?? 'roadmap';
  const boardId = pro.resolveBoardId(boardKey);

  /** GitHub App installation token for read endpoints. */
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
   * Per-user GitHub OAuth token for write endpoints. Mutations must be
   * attributed to the acting user, so there is deliberately no fallback to
   * the App token here.
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

  // ponytail: plain in-memory TTL cache, wiped wholesale on any write. One
  // backend instance and a ~200-item board make anything fancier (redis,
  // per-key invalidation) pointless. Ceiling: multi-replica deployments get
  // per-replica staleness up to the TTL; upgrade path is coreServices.cache.
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

  const router = Router();
  router.use(express.json());

  // The board tracks private-repo issues; require a Backstage user.
  router.use(async (req, _res, next) => {
    await httpAuth.credentials(req, { allow: ['user'] });
    next();
  });

  router.get('/schema', async (_req, res) => {
    const fields = await cached('schema', SCHEMA_TTL_MS, async () =>
      (await pro.listFields(boardId, await appToken())).map(mapField),
    );
    res.json({ board: boardKey, fields });
  });

  router.get('/items', async (req, res) => {
    const filters: Record<string, string> = {};
    for (const fieldName of ['team', 'status', 'kind', 'availability']) {
      const value = singleQueryValue(req.query[fieldName], fieldName);
      if (value) {
        filters[fieldName] = value;
      }
    }

    // Quarter is an iteration field, which pro's `filters` option does not
    // support. Its query terms pass through the keyword parameter, which pro
    // appends verbatim to the board query.
    const keywordTerms: string[] = [];
    const quarter = singleQueryValue(req.query.quarter, 'quarter');
    if (quarter) {
      keywordTerms.push(`quarter:"${quarter.replace(/"/g, '')}"`);
    }
    const keyword = singleQueryValue(req.query.keyword, 'keyword');
    if (keyword) {
      keywordTerms.push(keyword);
    }

    const listOptions = {
      boardId,
      filters,
      assignee: singleQueryValue(req.query.assignee, 'assignee') ?? null,
      state: singleQueryValue(req.query.state, 'state') ?? null,
      updated: singleQueryValue(req.query.updated, 'updated') ?? null,
      repository: singleQueryValue(req.query.repository, 'repository') ?? null,
      keyword: keywordTerms.length > 0 ? keywordTerms.join(' ') : null,
    };

    const cacheKey = `items:${JSON.stringify(listOptions)}`;
    const result = await cached(cacheKey, ITEMS_TTL_MS, async () =>
      pro.listItems({ ...listOptions, token: await appToken() }),
    );

    if (result.status !== 'success') {
      throw new InputError(result.error ?? 'Failed to list board items');
    }
    res.json({ items: result.data ?? [] });
  });

  router.get('/items/:id', async (req, res) => {
    const item = await cached(`item:${req.params.id}`, ITEMS_TTL_MS, async () =>
      pro.getItemByID(req.params.id, await appToken()),
    );
    res.json({ item });
  });

  /**
   * Resolve a GitHub issue (URL or `owner/repo#N` ref) to its project item
   * on the board. Used by the plans plugin to link plan PRDs to their epic.
   */
  router.get('/resolve-item', async (req, res) => {
    const issue = singleQueryValue(req.query.issue, 'issue');
    if (!issue) {
      throw new InputError('issue query parameter is required');
    }
    const ref = pro.parseIssueRef(issue);
    const result = (await pro.graphQLWithAuth(
      `query ($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $number) {
            projectItems(first: 20) {
              nodes {
                id
                project { id }
              }
            }
          }
        }
      }`,
      { owner: ref.owner, repo: ref.repo, number: ref.issue_number },
      await appToken(),
    )) as {
      repository?: {
        issue?: {
          projectItems?: {
            nodes?: Array<{ id: string; project?: { id: string } }>;
          };
        } | null;
      } | null;
    };

    const issueNode = result.repository?.issue;
    if (!issueNode) {
      throw new NotFoundError(`Issue ${issue} not found`);
    }
    const item = issueNode.projectItems?.nodes?.find(
      node => node.project?.id === boardId,
    );
    if (!item) {
      throw new NotFoundError(`Issue ${issue} is not on the ${boardKey} board`);
    }
    res.json({ itemId: item.id });
  });

  router.get('/issues/:owner/:repo/:number/sub-issues', async (req, res) => {
    const issueNumber = parseInt(req.params.number, 10);
    if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
      throw new InputError('number must be a positive integer');
    }
    const target = {
      owner: req.params.owner,
      repo: req.params.repo,
      issue_number: issueNumber,
    };
    const [subIssues, parent] = await cached(
      `sub-issues:${target.owner}/${target.repo}#${issueNumber}`,
      ITEMS_TTL_MS,
      async () => {
        const token = await appToken();
        return Promise.all([
          pro.listSubIssues({ ...target, per_page: 100 }, token),
          pro.getParentIssue(target, token),
        ]);
      },
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

    const field = await pro.findFieldByName(name, boardId, token);
    if (!field) {
      throw new InputError(`Field '${name}' not found or not updatable`);
    }

    let mutationValue: Record<string, unknown>;
    if (field.__typename === 'ProjectV2SingleSelectField') {
      const option = pro.findMatchingOption(field.options ?? [], value);
      if (!option) {
        const available = (field.options ?? []).map(o => o.name).join(', ');
        throw new InputError(
          `Value '${value}' not found for field '${field.name}'. Available options: ${available}`,
        );
      }
      mutationValue = { singleSelectOptionId: option.id };
    } else if (field.__typename === 'ProjectV2IterationField') {
      const iteration = pro.findMatchingIteration(field, value);
      if (!iteration) {
        throw new InputError(
          `Iteration '${value}' not found for field '${field.name}'`,
        );
      }
      mutationValue = { iterationId: iteration.id };
    } else {
      // findFieldByName only returns single-select, iteration, or DATE fields.
      mutationValue = { date: value };
    }

    await pro.updateItemField(
      req.params.id,
      field.id,
      mutationValue,
      boardId,
      token,
    );
    cache.clear();
    logger.info(`Updated field '${field.name}' on item ${req.params.id}`);
    res.json({ status: 'ok' });
  });

  router.post('/issues/:owner/:repo/:number/sub-issues', async (req, res) => {
    const token = userToken(req);
    const issueNumber = parseInt(req.params.number, 10);
    if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
      throw new InputError('number must be a positive integer');
    }
    const child = req.body?.child;
    if (typeof child !== 'string' || child.trim() === '') {
      throw new InputError(
        'child must be an issue URL or owner/repo#N reference',
      );
    }
    const resolved = await pro.resolveIssueId(child, { token });
    const parent = await pro.addSubIssue(
      {
        owner: req.params.owner,
        repo: req.params.repo,
        issue_number: issueNumber,
        subIssueId: resolved.id,
      },
      token,
    );
    cache.clear();
    res.status(201).json({ parent: mapRestIssue(parent) });
  });

  router.delete(
    '/issues/:owner/:repo/:number/sub-issues/:subIssueId',
    async (req, res) => {
      const token = userToken(req);
      const issueNumber = parseInt(req.params.number, 10);
      const subIssueId = parseInt(req.params.subIssueId, 10);
      if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
        throw new InputError('number must be a positive integer');
      }
      if (!Number.isInteger(subIssueId) || subIssueId <= 0) {
        throw new InputError('subIssueId must be a positive integer');
      }
      await pro.removeSubIssue(
        {
          owner: req.params.owner,
          repo: req.params.repo,
          issue_number: issueNumber,
          subIssueId,
        },
        token,
      );
      cache.clear();
      res.status(204).end();
    },
  );

  return router;
}
