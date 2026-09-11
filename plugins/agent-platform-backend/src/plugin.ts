import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';

/**
 * agentPlatformPlugin backend plugin
 *
 * The Agent Platform frontend's door to kagent: a JSON/SSE surface for the
 * browser over a native gRPC client of each installation's kagent API v2
 * controller (`AgentInstanceService`, `AgentTemplateService`, `SystemService`
 * and the A2A v1 `A2AService`), plus the model-manager pass-through.
 *
 * It exists because the browser cannot reach `kagent.<baseDomain>`
 * cross-origin, because gRPC over HTTP/2 wants a server-side client, and
 * because the user's per-installation Dex ID token has to *become* the
 * `authorization` metadata toward kagent (on the inbound leg that header
 * carries the Backstage identity instead).
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
