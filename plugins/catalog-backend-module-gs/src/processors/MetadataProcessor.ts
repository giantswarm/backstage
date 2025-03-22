import { CatalogProcessor } from '@backstage/plugin-catalog-node';
import { Entity } from '@backstage/catalog-model';
import { LoggerService } from '@backstage/backend-plugin-api';

export class MetadataProcessor implements CatalogProcessor {
  private readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    this.logger = logger;
  }

  getProcessorName(): string {
    return 'GSMetadataProcessor';
  }

  async preProcessEntity(entity: Entity): Promise<Entity> {
    this.logger.info(`Processing entity: ${entity.metadata.name}`);
    return entity;
  }
}
