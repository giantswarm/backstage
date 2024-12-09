import { createBackend } from '@backstage/backend-defaults';
import { BackendFeature } from '@backstage/backend-plugin-api';
import { githubAuthProvider } from './githubAuthProvider';

const backend = createBackend();

backend.add(import('@backstage/plugin-app-backend'));
backend.add(import('@backstage/plugin-proxy-backend'));

// scaffolder plugin
backend.add(import('@backstage/plugin-scaffolder-backend'));
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
backend.add(import('@backstage/plugin-techdocs-backend'));
backend.add(import('@giantswarm/backstage-plugin-techdocs-backend-module-gs'));

// auth plugin
backend.add(import('@backstage/plugin-auth-backend'));
backend.add(import('@giantswarm/backstage-plugin-auth-backend-module-gs'));
backend.add(githubAuthProvider);

// events plugin
backend.add(import('@backstage/plugin-events-backend'));

// catalog plugin
backend.add(import('@backstage/plugin-catalog-backend'));
backend.add(import('@backstage/plugin-catalog-backend-module-logs'));
backend.add(import('@backstage/plugin-catalog-backend-module-github'));
backend.add(import('@backstage/plugin-catalog-backend-module-aws'));
backend.add(
  import('@backstage/plugin-catalog-backend-module-scaffolder-entity-model'),
);

// permission plugin
backend.add(import('@backstage/plugin-permission-backend'));
backend.add(
  import('@backstage/plugin-permission-backend-module-allow-all-policy'),
);

// search plugin
backend.add(import('@backstage/plugin-search-backend'));

// search collators
backend.add(import('@backstage/plugin-search-backend-module-catalog'));
backend.add(import('@backstage/plugin-search-backend-module-techdocs'));

// kubernetes plugin
backend.add(import('@backstage/plugin-kubernetes-backend'));
backend.start();
