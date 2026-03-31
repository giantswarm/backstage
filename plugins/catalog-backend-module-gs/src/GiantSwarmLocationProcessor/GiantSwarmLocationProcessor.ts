import type { Entity } from '@backstage/catalog-model';
import type {
  CatalogProcessor,
  CatalogProcessorCache,
  CatalogProcessorEmit,
  CatalogProcessorParser,
} from '@backstage/plugin-catalog-node';
import { processingResult } from '@backstage/plugin-catalog-node';
import type { LocationSpec } from '@backstage/plugin-catalog-common';
import yaml from 'js-yaml';

const LOCATION_TYPE = 'giantswarm';
const NAMESPACE = 'giantswarm';

interface UrlReader {
  readUrl(url: string): Promise<{ buffer(): Promise<Buffer> }>;
  search(url: string): Promise<{
    files: Array<{ url: string; content(): Promise<Buffer> }>;
  }>;
}

export class GiantSwarmLocationProcessor implements CatalogProcessor {
  constructor(private readonly urlReader: UrlReader) {}

  getProcessorName(): string {
    return 'GiantSwarmLocationProcessor';
  }

  async readLocation(
    location: LocationSpec,
    optional: boolean,
    emit: CatalogProcessorEmit,
    _parser: CatalogProcessorParser,
    _cache: CatalogProcessorCache,
  ): Promise<boolean> {
    if (location.type !== LOCATION_TYPE) {
      return false;
    }

    try {
      if (location.target.includes('*')) {
        await this.readGlob(location, emit);
      } else {
        await this.readSingle(location, emit);
      }
    } catch (error) {
      const message = `Unable to read ${location.type} ${location.target}, ${error}`;
      if (!optional) {
        emit(processingResult.generalError(location, message));
      }
    }

    return true;
  }

  private async readSingle(
    location: LocationSpec,
    emit: CatalogProcessorEmit,
  ): Promise<void> {
    const response = await this.urlReader.readUrl(location.target);
    const content = (await response.buffer()).toString('utf-8');

    for (const entity of this.parseYaml(content)) {
      if (!entity.metadata.namespace) {
        entity.metadata.namespace = NAMESPACE;
      }
      emit(
        processingResult.entity(
          { type: 'url', target: location.target },
          entity,
        ),
      );
    }
  }

  private async readGlob(
    location: LocationSpec,
    emit: CatalogProcessorEmit,
  ): Promise<void> {
    const response = await this.urlReader.search(location.target);

    for (const file of response.files) {
      const content = (await file.content()).toString('utf-8');

      for (const entity of this.parseYaml(content)) {
        if (!entity.metadata.namespace) {
          entity.metadata.namespace = NAMESPACE;
        }
        emit(
          processingResult.entity({ type: 'url', target: file.url }, entity),
        );
      }
    }
  }

  private parseYaml(content: string): Entity[] {
    const documents = yaml.loadAll(content) as unknown[];
    return documents.filter(
      (doc): doc is Entity =>
        doc !== null &&
        typeof doc === 'object' &&
        'apiVersion' in doc &&
        'kind' in doc &&
        'metadata' in doc &&
        typeof (doc as Entity).metadata?.name === 'string',
    );
  }
}
