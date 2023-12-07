import { Entity } from '@backstage/catalog-model';

export const GS_APP_FLAVOR_LABEL = 'giantswarm.io/flavor-app';

export const getServiceNameFromEntity = (entity: Entity) =>
  entity.metadata.name;
