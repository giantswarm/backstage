import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';

/**
 * musterPlugin backend plugin
 *
 * Thin REST proxy over the muster MCP server's core workflow tools
 * (core_workflow_list/get, core_workflow_execution_list/get), consumed by
 * the muster frontend plugin for workflow visualization.
 *
 * @public
 */
export const musterPlugin = createBackendPlugin({
  pluginId: 'muster',
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
