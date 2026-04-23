import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { ConversationStore } from './services/ConversationStore';

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
        database: coreServices.database,
      },
      async init({ httpAuth, httpRouter, logger, config, userInfo, database }) {
        const conversationStore = await ConversationStore.create({
          database,
          logger,
        });

        httpRouter.use(
          await createRouter({
            httpAuth,
            logger,
            config,
            userInfo,
            conversationStore,
          }),
        );
      },
    });
  },
});
