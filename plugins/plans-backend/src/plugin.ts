import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { MusterServerClient } from '@giantswarm/backstage-plugin-gs-node';
import { createRouter } from './router';

/**
 * plansPlugin backend plugin
 *
 * Thin REST API over plan repositories (e.g. giantswarm/bumblebee-plans),
 * consumed by the plans frontend plugin to render proposed (open PR) and
 * merged plan documents and to read/write PR discussion and inline review
 * comments. Every GitHub call runs as the signed-in person: the frontend
 * forwards the caller's Dex ID token, muster holds the person's GitHub grant
 * and executes the GitHub MCP server's tools with it (`plans.muster`). No
 * GitHub credential exists in the portal.
 *
 * @public
 */
export const plansPlugin = createBackendPlugin({
  pluginId: 'plans',
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
            github: MusterServerClient.fromConfig(config, logger, 'plans'),
          }),
        );
      },
    });
  },
});
