import { CatalogProcessor } from '@backstage/plugin-catalog-node';
import { Entity } from '@backstage/catalog-model';
import { GS_DEPLOYMENT_NAMES } from '@giantswarm/backstage-plugin-gs-common';
import merge from 'lodash/merge';
import { isGSService } from './utils';

export class ServiceDeploymentsProcessor implements CatalogProcessor {
  getProcessorName(): string {
    return 'ServiceDeploymentsProcessor';
  }

  async preProcessEntity(entity: Entity): Promise<Entity> {
    if (!isGSService(entity)) {
      return entity;
    }

    const nameWithoutAppSuffix = entity.metadata.name.replace(/-app$/, '');
    const nameWithAppSuffix = `${nameWithoutAppSuffix}-app`;

    const names = [nameWithoutAppSuffix, nameWithAppSuffix];

    return merge(
      {
        metadata: {
          annotations: {
            [GS_DEPLOYMENT_NAMES]: names.join(','),
          },
        },
      },
      entity,
    );
  }
}
