import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { MusterServerClient } from '@giantswarm/backstage-plugin-gs-node';
import { createRouter } from './router';

/**
 * repositoriesPlugin backend plugin
 *
 * A gateway over giantswarm-repo-manager's read tools for the Repositories
 * page: the inventory of the org's repositories (`list_repositories`), one
 * repository's full record (`get_repository`), a rebuild of that record
 * (`refresh_repository`) and the manager's identity report (`get_info`).
 * Every call runs as the signed-in person: the frontend forwards the caller's
 * Dex ID token, muster forwards it to the manager, which obtains the person's
 * GitHub grant from muster's token broker (`repositories.muster`). Nothing is
 * composed here -- the page shows what the tools return.
 *
 * @public
 */
export const repositoriesPlugin = createBackendPlugin({
  pluginId: 'repositories',
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
            httpAuth,
            manager: MusterServerClient.fromConfig(
              config,
              logger,
              'repositories',
            ),
          }),
        );
      },
    });
  },
});
