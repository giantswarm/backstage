import { Entity } from '@backstage/catalog-model';

export function setupEntities() {
  const component: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'test-component',
    },
  };

  const website: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'test-website',
    },
    spec: {
      type: 'website',
    },
  };

  const service: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'test-service',
      annotations: {
        'backstage.io/source-location':
          'url:https://github.com/test-org/test-service',
      },
    },
    spec: {
      type: 'service',
    },
  };

  const api: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'API',
    metadata: {
      name: 'test-api',
    },
  };

  const system: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'System',
    metadata: {
      name: 'test-system',
    },
  };

  const user: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'User',
    metadata: {
      name: 'test-user',
    },
  };

  const group: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Group',
    metadata: {
      name: 'test-group',
    },
  };

  return {
    component,
    website,
    service,
    api,
    system,
    user,
    group,
  };
}
