import 'global-agent/bootstrap';
import { createBackend } from '@backstage/backend-defaults';
import {
  customHttpAuthServiceFactory,
  rootLogger,
} from '@internal/backend-common';

const backend = createBackend();

// Override default httpAuth to read tokens from X-Backstage-Token header,
// avoiding conflicts with ingress-level Basic auth on the Authorization header.
backend.add(customHttpAuthServiceFactory);

// auth plugin
backend.add(import('@backstage/plugin-auth-backend'));
backend.add(import('@giantswarm/backstage-plugin-auth-backend-module-gs'));

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

// kubernetes plugin
backend.add(import('@backstage/plugin-kubernetes-backend'));

// custom root logger service
backend.add(rootLogger);

backend.start();
