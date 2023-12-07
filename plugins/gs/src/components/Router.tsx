import { Entity } from '@backstage/catalog-model';
import { GS_APP_FLAVOR_LABEL } from './getAppNameFromEntity';

export const isGSDeploymentsAvailable = (entity: Entity) =>
  entity.metadata.labels?.[GS_APP_FLAVOR_LABEL] === 'true';
