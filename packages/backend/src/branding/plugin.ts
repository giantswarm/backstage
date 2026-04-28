import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';

export const brandingPlugin = createBackendPlugin({
  pluginId: 'branding',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        logger: coreServices.logger,
        config: coreServices.rootConfig,
      },
      async init({ httpRouter, logger, config }) {
        httpRouter.use(await createRouter({ config, logger }));

        httpRouter.addAuthPolicy({
          path: '/',
          allow: 'unauthenticated',
        });
      },
    });
  },
});
