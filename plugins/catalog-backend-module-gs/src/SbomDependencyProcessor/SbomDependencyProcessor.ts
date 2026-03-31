import type { Entity } from '@backstage/catalog-model';
import type {
  CatalogProcessor,
  CatalogProcessorCache,
  CatalogProcessorEmit,
} from '@backstage/plugin-catalog-node';
import type { LocationSpec } from '@backstage/plugin-catalog-common';
import type { LoggerService } from '@backstage/backend-plugin-api';
import type { Knex } from 'knex';

const GITHUB_PROJECT_SLUG_ANNOTATION = 'github.com/project-slug';

export class SbomDependencyProcessor implements CatalogProcessor {
  constructor(
    private readonly db: Knex,
    private readonly logger: LoggerService,
  ) {}

  getProcessorName(): string {
    return 'SbomDependencyProcessor';
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

    const slug = entity.metadata.annotations?.[GITHUB_PROJECT_SLUG_ANNOTATION];
    if (!slug) {
      return entity;
    }

    let rows: Array<{ dependency_name: string }>;
    try {
      rows = await this.db('sbom_dependencies')
        .select('dependency_name')
        .where('repo_slug', slug);
    } catch (error) {
      this.logger.warn(
        `Failed to query SBOM dependencies for ${slug}: ${error}`,
      );
      return entity;
    }

    if (rows.length === 0) {
      return entity;
    }

    const sbomDeps = rows.map(row => `component:${row.dependency_name}`);
    const existing = ((entity.spec as any)?.dependsOn as string[]) ?? [];
    const merged = [...new Set([...existing, ...sbomDeps])];

    return {
      ...entity,
      spec: {
        ...entity.spec,
        dependsOn: merged,
      },
    };
  }
}
