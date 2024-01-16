import {
  ANNOTATION_SOURCE_LOCATION,
  Entity,
} from '@backstage/catalog-model';

export const GS_DEPLOYMENT_NAMES = 'giantswarm.io/deployment-names';

export const isEntityDeploymentsAvailable = (entity: Entity) => 
  Boolean(entity.metadata.annotations?.[GS_DEPLOYMENT_NAMES]);

export const getDeploymentNamesFromEntity = (entity: Entity) => {
  const deploymentNames = entity.metadata.annotations?.[GS_DEPLOYMENT_NAMES];

  if (!deploymentNames) {
    return undefined;
  }

  return deploymentNames.replace(/\s/g, '').split(',');
}

export const getSourceLocationFromEntity = (entity: Entity) => {
  const location = entity.metadata.annotations?.[ANNOTATION_SOURCE_LOCATION];

return location && location.startsWith('url:') ? location.replace(/^url:/, '') : location;
}
