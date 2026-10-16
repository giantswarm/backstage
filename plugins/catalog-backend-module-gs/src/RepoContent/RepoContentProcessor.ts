import type { Entity } from '@backstage/catalog-model';
import {
  type AuthService,
  type DatabaseService,
  type LoggerService,
  readSchedulerServiceTaskScheduleDefinitionFromConfig,
  type RootConfigService,
  type SchedulerService,
} from '@backstage/backend-plugin-api';
import type {
  CatalogProcessor,
  CatalogProcessorCache,
  CatalogProcessorEmit,
  CatalogService,
} from '@backstage/plugin-catalog-node';
import type { LocationSpec } from '@backstage/plugin-catalog-common';
import {
  DefaultGithubCredentialsProvider,
  ScmIntegrations,
} from '@backstage/integration';
import { Annotations } from '@giantswarm/backstage-plugin-gs-common';
import { getMigratedClient } from '../util/database';
import {
  PROJECT_SLUG_ANNOTATION,
  parseProjectSlug,
  type ProjectSlug,
} from '../util/projectSlug';
import { createRepoContentRefreshTask } from './repoContentScheduledTask';
import { RepoContentSnapshot } from './repoContentSnapshot';
import { type RepoContent, RepoContentStore } from './repoContentStore';

const TECHDOCS_REF_ANNOTATION = 'backstage.io/techdocs-ref';
const DEFAULT_BRANCH_MASTER_TAG = 'defaultbranch:master';

/**
 * Branch names that survive as the last segment of a `tree/<branch>` URL.
 * Backstage's GitHub reader and the TechDocs edit link both read the branch
 * back from there, so `release/v1` would come back as `v1`, and `#`, `%` or
 * `?` would change what the URL means.
 */
const URL_SAFE_BRANCH = /^[^/#%?\s]+$/;

/**
 * Annotates Component entities with what their repository's default branch
 * holds, from the record the repo content refresh task keeps. Makes no calls
 * of its own.
 */
export class RepoContentProcessor implements CatalogProcessor {
  constructor(private readonly snapshot: RepoContentSnapshot) {}

  static async create(options: {
    config: RootConfigService;
    database: DatabaseService;
    logger: LoggerService;
    catalogApi: CatalogService;
    scheduler: SchedulerService;
    auth: AuthService;
  }): Promise<RepoContentProcessor> {
    const { config, database, logger, catalogApi, scheduler, auth } = options;

    const store = new RepoContentStore(await getMigratedClient(database));
    const snapshot = new RepoContentSnapshot(store, logger);
    const integrations = ScmIntegrations.fromConfig(config);
    const scheduleConfig = config.getOptionalConfig(
      'catalog.processors.repoContent.schedule',
    );

    await createRepoContentRefreshTask({
      credentialsProvider:
        DefaultGithubCredentialsProvider.fromIntegrations(integrations),
      integrations,
      catalogApi,
      auth,
      store,
      onStoreChanged: () => snapshot.invalidate(),
      logger,
      scheduler,
      schedule: scheduleConfig
        ? readSchedulerServiceTaskScheduleDefinitionFromConfig(scheduleConfig)
        : undefined,
    });

    return new RepoContentProcessor(snapshot);
  }

  getProcessorName(): string {
    return 'RepoContentProcessor';
  }

  async preProcessEntity(
    entity: Entity,
    _location: LocationSpec,
    _emit: CatalogProcessorEmit,
    _originLocation: LocationSpec,
    _cache: CatalogProcessorCache,
  ): Promise<Entity> {
    if (entity.kind !== 'Component') {
      return entity;
    }
    const slug = parseProjectSlug(
      entity.metadata.annotations?.[PROJECT_SLUG_ANNOTATION],
    );
    if (!slug) {
      return entity;
    }

    const records = await this.snapshot.get();
    const content = records?.get(`${slug.owner}/${slug.repo}`);
    return content ? withRepoContent(entity, slug, content) : entity;
  }
}

/**
 * Writes the default branch, and a TechDocs reference when the default branch
 * has a README. Once a record exists it is the authority for the default
 * branch and the `defaultbranch:master` tag.
 *
 * A `techdocs-ref` is only written or removed while it is absent or has the
 * `url:https://github.com/<slug>/tree/<branch>` shape written here and by the
 * importer: any other value (`dir:.`, a docs subdirectory, another repo) was
 * set by hand and is left alone.
 *
 * The TechDocs reference ends in the branch name, which the TechDocs URL
 * preparer in `techdocs-backend-module-gs` reads back for the edit link.
 */
export function withRepoContent(
  entity: Entity,
  slug: ProjectSlug,
  content: RepoContent,
): Entity {
  const annotations: Record<string, string> = {
    ...(entity.metadata.annotations ?? {}),
  };
  const { defaultBranch, hasReadme } = content;

  if (defaultBranch) {
    annotations[Annotations.annotationDefaultBranch] = defaultBranch;
  } else {
    delete annotations[Annotations.annotationDefaultBranch];
  }
  const treeUrl = `url:https://github.com/${slug.owner}/${slug.repo}/tree/`;
  const existingRef = annotations[TECHDOCS_REF_ANNOTATION];
  if (existingRef === undefined || existingRef.startsWith(treeUrl)) {
    if (defaultBranch && hasReadme && URL_SAFE_BRANCH.test(defaultBranch)) {
      annotations[TECHDOCS_REF_ANNOTATION] = `${treeUrl}${defaultBranch}`;
    } else {
      delete annotations[TECHDOCS_REF_ANNOTATION];
    }
  }

  const tags = (entity.metadata.tags ?? []).filter(
    tag => tag !== DEFAULT_BRANCH_MASTER_TAG,
  );
  if (defaultBranch === 'master') {
    tags.push(DEFAULT_BRANCH_MASTER_TAG);
  }

  return {
    ...entity,
    metadata: {
      ...entity.metadata,
      annotations,
      ...(entity.metadata.tags || tags.length > 0 ? { tags } : {}),
    },
  };
}
