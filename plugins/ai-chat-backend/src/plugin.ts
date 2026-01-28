import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';

/**
 * aiChatPlugin backend plugin
 *
 * @public
 */
export const aiChatPlugin = createBackendPlugin({
  pluginId: 'ai-chat',
  register(env) {
    env.registerInit({
      deps: {
        httpAuth: coreServices.httpAuth,
        httpRouter: coreServices.httpRouter,
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        userInfo: coreServices.userInfo,
      },
      async init({ httpAuth, httpRouter, logger, config, userInfo }) {
        httpRouter.use(
          await createRouter({
            httpAuth,
            logger,
            config,
            userInfo,
          }),
        );
      },
    });
  },
});
