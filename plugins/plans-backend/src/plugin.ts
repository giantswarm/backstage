import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';

/**
 * plansPlugin backend plugin
 *
 * Thin REST proxy over the GitHub API for plan repositories (e.g.
 * giantswarm/bumblebee-plans), consumed by the plans frontend plugin to
 * render proposed (open PR) and merged plan documents and to read/write PR
 * discussion and inline review comments. Every GitHub call runs with the
 * caller's own GitHub token (`X-GitHub-Token`, obtained by the frontend from
 * the portal's GitHub auth provider), so nothing here acts as a shared App
 * identity.
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
          }),
        );
      },
    });
  },
});
