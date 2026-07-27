import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';

/**
 * agentPlatformPlugin backend plugin
 *
 * Thin REST proxy over the kagent controller API, per installation, consumed by
 * the agent-platform frontend plugin's "Sessions" list.
 *
 * It exists because the browser cannot reach `kagent.<baseDomain>`
 * cross-origin, and because the user's per-installation Dex ID token has to
 * *become* the `Authorization` header toward kagent (on the inbound leg that
 * header carries the Backstage identity instead).
 *
 * @public
 */
export const agentPlatformPlugin = createBackendPlugin({
  pluginId: 'agent-platform',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        logger: coreServices.logger,
        config: coreServices.rootConfig,
      },
      async init({ httpRouter, logger, config }) {
        httpRouter.use(
          await createRouter({
            logger,
            config,
          }),
        );
      },
    });
  },
});
