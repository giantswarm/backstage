import { createBackend } from '@backstage/backend-defaults';
import { BackendFeature } from '@backstage/backend-plugin-api';
import { githubAuthProvider } from './githubAuthProvider';

const backend = createBackend();

backend.add(import('@backstage/plugin-app-backend/alpha'));
backend.add(import('@backstage/plugin-proxy-backend/alpha'));

// scaffolder plugin
backend.add(import('@backstage/plugin-scaffolder-backend/alpha'));
backend.add(import('@backstage/plugin-scaffolder-backend-module-github'));
backend.add(
  import('@giantswarm/backstage-plugin-scaffolder-backend-module-gs'),
);
backend.add(
  import(
    '@aws/aws-core-plugin-for-backstage-scaffolder-actions'
  ) as unknown as BackendFeature,
);

// techdocs plugin
backend.add(import('@backstage/plugin-techdocs-backend/alpha'));
backend.add(import('@giantswarm/backstage-plugin-techdocs-backend-module-gs'));

// auth plugin
backend.add(import('@backstage/plugin-auth-backend'));
backend.add(import('@giantswarm/backstage-plugin-auth-backend-module-gs'));
backend.add(githubAuthProvider);

// events plugin
backend.add(import('@backstage/plugin-events-backend/alpha'));

// catalog plugin
backend.add(import('@backstage/plugin-catalog-backend/alpha'));
backend.add(import('@backstage/plugin-catalog-backend-module-logs'));
backend.add(import('@backstage/plugin-catalog-backend-module-github/alpha'));
backend.add(import('@backstage/plugin-catalog-backend-module-aws/alpha'));
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
