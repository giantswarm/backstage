import 'global-agent/bootstrap';
import { createBackend } from '@backstage/backend-defaults';
import { rootLogger } from '@internal/backend-common';

const backend = createBackend();

backend.add(import('@backstage/plugin-app-backend'));
backend.add(import('@backstage/plugin-proxy-backend'));

// scaffolder plugin
backend.add(import('@backstage/plugin-scaffolder-backend'));
backend.add(import('@backstage/plugin-scaffolder-backend-module-github'));
backend.add(
  import('@backstage/plugin-scaffolder-backend-module-notifications'),
);
backend.add(
  import('@giantswarm/backstage-plugin-scaffolder-backend-module-gs'),
);
backend.add(import('@aws/aws-core-plugin-for-backstage-scaffolder-actions'));
backend.add(import('@devangelista/backstage-scaffolder-kubernetes'));
backend.add(import('@roadiehq/scaffolder-backend-module-utils'));

// techdocs plugin
backend.add(import('@backstage/plugin-techdocs-backend'));
backend.add(import('@giantswarm/backstage-plugin-techdocs-backend-module-gs'));

// auth plugin
backend.add(import('@backstage/plugin-auth-backend'));
backend.add(import('@backstage/plugin-auth-backend-module-github-provider'));
backend.add(import('@giantswarm/backstage-plugin-auth-backend-module-gs'));

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

// custom root logger service
backend.add(rootLogger);

// search plugin
backend.add(import('@backstage/plugin-search-backend'));

// search collators
backend.add(import('@backstage/plugin-search-backend-module-catalog'));
backend.add(import('@backstage/plugin-search-backend-module-techdocs'));

// kubernetes plugin
backend.add(import('@backstage/plugin-kubernetes-backend'));

// notifications and signals plugins
backend.add(import('@backstage/plugin-notifications-backend'));
backend.add(import('@backstage/plugin-signals-backend'));

// giantswarm plugin
backend.add(import('@giantswarm/backstage-plugin-gs-backend'));

// ai chat plugin
backend.add(import('@giantswarm/backstage-plugin-ai-chat-backend'));

backend.start();
