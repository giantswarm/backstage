import type {
  AuthService,
  LoggerService,
  SchedulerService,
  SchedulerServiceTaskScheduleDefinition,
} from '@backstage/backend-plugin-api';
import type { CatalogService } from '@backstage/plugin-catalog-node';
import type {
  GithubCredentialsProvider,
  ScmIntegrationRegistry,
} from '@backstage/integration';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { isTransientError } from '../util/errors';
import { resolveGithubToken } from '../util/githubToken';
import { parseProjectSlug, type ProjectSlug } from '../util/projectSlug';
import { BATCH_SIZE, fetchRepoContentBatch } from './fetchRepoContent';
import type { RepoContentStore } from './repoContentStore';

const PROJECT_SLUG_ANNOTATION = 'github.com/project-slug';

const DEFAULT_SCHEDULE: SchedulerServiceTaskScheduleDefinition = {
  frequency: { minutes: 60 },
  timeout: { minutes: 15 },
  initialDelay: { minutes: 1 },
};

type RefreshOptions = {
  credentialsProvider: GithubCredentialsProvider;
  integrations: ScmIntegrationRegistry;
  catalogApi: CatalogService;
  auth: AuthService;
  store: RepoContentStore;
  logger: LoggerService;
  fetchImpl?: typeof fetch;
};

export async function createRepoContentRefreshTask(
  options: RefreshOptions & {
    scheduler: SchedulerService;
    schedule?: SchedulerServiceTaskScheduleDefinition;
  },
) {
  const { scheduler, schedule = DEFAULT_SCHEDULE, ...refreshOptions } = options;
  await scheduler.scheduleTask({
    id: 'catalog-module-gs:repo-content-refresh',
    ...schedule,
    fn: () => refreshRepoContent(refreshOptions),
  });
}

/**
 * Fetches `RepoContent` for every repository a Component names in
 * `github.com/project-slug`, stores it, and asks the catalog to reprocess the
 * components whose record changed. A repository that could not be asked keeps
 * its previous record until the next run.
 */
export async function refreshRepoContent(options: RefreshOptions) {
  const {
    credentialsProvider,
    integrations,
    catalogApi,
    auth,
    store,
    logger,
    fetchImpl = fetch,
  } = options;

  const credentials = await auth.getOwnServiceCredentials();

  // Several components can name the same repository.
  const refsBySlug = new Map<string, string[]>();
  const slugsByOwner = new Map<string, ProjectSlug[]>();
  for await (const batch of catalogApi.streamEntities(
    {
      filter: { kind: 'Component' },
      fields: [
        'kind',
        'metadata.name',
        'metadata.namespace',
        `metadata.annotations.${PROJECT_SLUG_ANNOTATION}`,
      ],
    },
    { credentials },
  )) {
    for (const entity of batch) {
      const raw = entity.metadata.annotations?.[PROJECT_SLUG_ANNOTATION];
      const slug = parseProjectSlug(raw);
      if (!raw || !slug) {
        continue;
      }
      const refs = refsBySlug.get(raw);
      if (refs) {
        refs.push(stringifyEntityRef(entity));
        continue;
      }
      refsBySlug.set(raw, [stringifyEntityRef(entity)]);
      const owned = slugsByOwner.get(slug.owner) ?? [];
      owned.push(slug);
      slugsByOwner.set(slug.owner, owned);
    }
  }

  const changed = new Set<string>();
  let failed = 0;
  const fetchedAt = new Date();
  for (const [owner, slugs] of slugsByOwner) {
    const token = await resolveGithubToken({
      url: `https://github.com/${owner}`,
      credentialsProvider,
      integrations,
      logger,
    });
    if (!token) {
      // GraphQL has no anonymous mode: a configuration gap someone has to fix.
      logger.warn('Repo content refresh: no GitHub token for owner', {
        owner,
      });
      failed += slugs.length;
      continue;
    }

    for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
      const batch = slugs.slice(i, i + BATCH_SIZE);
      let result;
      try {
        result = await fetchRepoContentBatch({
          slugs: batch,
          token,
          fetchImpl,
        });
      } catch (error) {
        const meta = { owner, repos: batch.length, error: String(error) };
        if (isTransientError(error)) {
          logger.info('Repo content refresh: batch failed', meta);
        } else {
          logger.warn('Repo content refresh: batch failed', meta);
        }
        failed += batch.length;
        continue;
      }

      for (const [key, content] of result.content) {
        if (await store.put(key, content, fetchedAt)) {
          refsBySlug.get(key)?.forEach(ref => changed.add(ref));
        }
      }
      for (const key of result.unreadable) {
        logger.debug('Repo content refresh: repository not readable', {
          repo: key,
        });
        if (await store.delete(key)) {
          refsBySlug.get(key)?.forEach(ref => changed.add(ref));
        }
      }
      failed += result.failed.length;
    }
  }

  const removed = await store.retainOnly(Array.from(refsBySlug.keys()));

  logger.info('Repo content refresh complete', {
    repos: refsBySlug.size,
    failed,
    changedEntities: changed.size,
    removedRecords: removed,
  });

  for (const ref of changed) {
    try {
      await catalogApi.refreshEntity(ref, { credentials });
    } catch (error) {
      logger.info('Repo content refresh: entity refresh failed', {
        entityRef: ref,
        error: String(error),
      });
    }
  }
}
