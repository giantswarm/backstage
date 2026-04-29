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
        auth: coreServices.auth,
        httpAuth: coreServices.httpAuth,
        httpRouter: coreServices.httpRouter,
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        userInfo: coreServices.userInfo,
        database: coreServices.database,
      },
      async init({
        auth,
        httpAuth,
        httpRouter,
        logger,
        config,
        userInfo,
        database,
      }) {
        const conversationStore = await ConversationStore.create({
          database,
          logger,
        });

        httpRouter.use(
          await createRouter({
            auth,
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
