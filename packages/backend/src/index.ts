import { legacyPlugin } from '@backstage/backend-common';
import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();

backend.add(import('@backstage/plugin-app-backend/alpha'));
backend.add(import('@backstage/plugin-proxy-backend/alpha'));
backend.add(import('@backstage/plugin-scaffolder-backend/alpha'));

// techdocs plugin
// TODO: Migrate to the new techdocs-backend plugin when custom preparers are supported - https://github.com/backstage/backstage/issues/21952
// backend.add(import('@backstage/plugin-techdocs-backend/alpha'));
backend.add(legacyPlugin('techdocs-backend', import('./plugins/techdocs')));

// healthcheck plugin
backend.add(legacyPlugin('healthcheck', import('./plugins/healthcheck')));

// auth plugin
backend.add(import('@backstage/plugin-auth-backend'));
backend.add(import('@backstage/plugin-auth-backend-module-github-provider'));
// catalog plugin
backend.add(import('@backstage/plugin-catalog-backend/alpha'));
backend.add(
  import('@backstage/plugin-catalog-backend-module-scaffolder-entity-model'),
);
// permission plugin
backend.add(import('@backstage/plugin-permission-backend/alpha'));
backend.add(
  import('@backstage/plugin-permission-backend-module-allow-all-policy'),
);
// search plugin
backend.add(import('@backstage/plugin-search-backend/alpha'));
backend.add(import('@backstage/plugin-search-backend-module-catalog/alpha'));
backend.add(import('@backstage/plugin-search-backend-module-techdocs/alpha'));
// kubernetes plugin
backend.add(import('@backstage/plugin-kubernetes-backend/alpha'));
backend.start();
