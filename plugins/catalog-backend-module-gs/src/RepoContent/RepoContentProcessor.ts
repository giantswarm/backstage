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
import { createRepoContentRefreshTask } from './repoContentScheduledTask';
import { type RepoContent, RepoContentStore } from './repoContentStore';

const PROJECT_SLUG_ANNOTATION = 'github.com/project-slug';
const TECHDOCS_REF_ANNOTATION = 'backstage.io/techdocs-ref';
const DEFAULT_BRANCH_MASTER_TAG = 'defaultbranch:master';

/**
 * Annotates Component entities with what their repository's default branch
 * holds, from the record the repo content refresh task keeps. Makes no calls
 * of its own.
 */
export class RepoContentProcessor implements CatalogProcessor {
  constructor(
    private readonly store: RepoContentStore,
    private readonly logger: LoggerService,
  ) {}

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
      logger,
      scheduler,
      schedule: scheduleConfig
        ? readSchedulerServiceTaskScheduleDefinitionFromConfig(scheduleConfig)
        : undefined,
    });

    return new RepoContentProcessor(store, logger);
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
    const slug = entity.metadata.annotations?.[PROJECT_SLUG_ANNOTATION];
    if (!slug) {
      return entity;
    }

    let content: RepoContent | undefined;
    try {
      content = await this.store.get(slug);
    } catch (error) {
      this.logger.warn('RepoContentProcessor: reading the record failed', {
        repo: slug,
        error: String(error),
      });
      return entity;
    }
    return content ? withRepoContent(entity, content) : entity;
  }
}

/**
 * Writes the default branch, and a TechDocs reference when the default branch
 * has a README. Once a record exists it is the authority: a `techdocs-ref` or
 * `defaultbranch:master` tag the entity arrived with is removed when the
 * record no longer supports it.
 *
 * The TechDocs reference ends in the branch name, which the TechDocs URL
 * preparer in `techdocs-backend-module-gs` reads back for the edit link.
 */
export function withRepoContent(entity: Entity, content: RepoContent): Entity {
  const slug = entity.metadata.annotations?.[PROJECT_SLUG_ANNOTATION];
  const annotations: Record<string, string> = {
    ...(entity.metadata.annotations ?? {}),
  };
  const { defaultBranch, hasReadme } = content;

  if (defaultBranch) {
    annotations[Annotations.annotationDefaultBranch] = defaultBranch;
  } else {
    delete annotations[Annotations.annotationDefaultBranch];
  }
  if (defaultBranch && hasReadme) {
    annotations[TECHDOCS_REF_ANNOTATION] =
      `url:https://github.com/${slug}/tree/${defaultBranch}`;
  } else {
    delete annotations[TECHDOCS_REF_ANNOTATION];
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
