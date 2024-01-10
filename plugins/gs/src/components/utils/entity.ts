import { Entity } from '@backstage/catalog-model';

const GS_APP_FLAVOR_LABEL = 'giantswarm.io/flavor-app';
const GITHUB_PROJECT_SLUG_ANNOTATION = 'github.com/project-slug';

export const getServiceNameFromEntity = (entity: Entity) =>
  entity.metadata.name;

export const getProjectSlugFromEntity = (entity: Entity) =>
  entity.metadata.annotations?.[GITHUB_PROJECT_SLUG_ANNOTATION];

export const isEntityDeploymentsAvailable = (entity: Entity) =>
  entity.metadata.labels?.[GS_APP_FLAVOR_LABEL] === 'true';
