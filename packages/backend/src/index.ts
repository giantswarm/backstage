import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();

backend.add(import('@backstage/plugin-app-backend/alpha'));
backend.add(import('@backstage/plugin-proxy-backend/alpha'));

// scaffolder plugin
backend.add(import('@backstage/plugin-scaffolder-backend/alpha'));
backend.add(import('@backstage/plugin-scaffolder-backend-module-github'));
backend.add(import('@internal/plugin-scaffolder-backend-module-gs'));

// techdocs plugin
backend.add(import('@backstage/plugin-techdocs-backend/alpha'));
backend.add(import('@internal/plugin-techdocs-backend-module-gs-preparer'));

backend.add(import('./plugins/healthcheck'));

// auth plugin
backend.add(import('@backstage/plugin-auth-backend'));
backend.add(import('@internal/plugin-auth-backend-module-gs-providers'));

// events plugin
backend.add(import('@backstage/plugin-events-backend/alpha'));

// catalog plugin
backend.add(import('@backstage/plugin-catalog-backend/alpha'));
backend.add(import('@backstage/plugin-catalog-backend-module-logs'));
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

// search collators
backend.add(import('@backstage/plugin-search-backend-module-catalog/alpha'));
backend.add(import('@backstage/plugin-search-backend-module-techdocs/alpha'));

// kubernetes plugin
backend.add(import('@backstage/plugin-kubernetes-backend/alpha'));
backend.start();
