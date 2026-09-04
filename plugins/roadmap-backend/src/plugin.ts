import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { MusterServerClient } from '@giantswarm/backstage-plugin-gs-node';
import { createRouter } from './router';

/**
 * roadmapPlugin backend plugin
 *
 * REST API over a GitHub Projects board (the giantswarm roadmap), consumed by
 * the roadmap frontend plugin. Every board read and write runs as the
 * signed-in person: the frontend forwards the caller's Dex ID token, muster
 * runs pro's board tools with the person's own GitHub grant
 * (`roadmap.muster`). No GitHub credential exists in the portal.
 *
 * @public
 */
export const roadmapPlugin = createBackendPlugin({
  pluginId: 'roadmap',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        httpAuth: coreServices.httpAuth,
      },
      async init({ httpRouter, logger, config, httpAuth }) {
        httpRouter.use(
          await createRouter({
            logger,
            config,
            httpAuth,
            pro: MusterServerClient.fromConfig(config, logger, 'roadmap'),
          }),
        );
      },
    });
  },
});
