import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { MusterServerClient } from '@giantswarm/backstage-plugin-gs-node';
import { createRouter } from './router';

/**
 * github-actions backend plugin
 *
 * REST API behind the catalog's GitHub Actions tab
 * (`@backstage-community/plugin-github-actions`): workflow runs, jobs, logs
 * and re-runs of a repository, read and triggered as the signed-in person.
 * The frontend forwards the caller's Dex ID token, muster runs GitHub's
 * `actions` toolset with the person's own GitHub grant
 * (`githubActions.muster`). No GitHub credential exists in the portal.
 *
 * @public
 */
export const githubActionsPlugin = createBackendPlugin({
  pluginId: 'github-actions',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        httpAuth: coreServices.httpAuth,
      },
      async init({ httpRouter, logger, config, httpAuth }) {
        const actions = MusterServerClient.fromConfig(
          config,
          logger,
          'githubActions',
        );
        const repos =
          MusterServerClient.fromConfig(
            config,
            logger,
            'githubActions.repos',
          ) ?? actions;
        httpRouter.use(
          await createRouter({ logger, httpAuth, actions, repos }),
        );
      },
    });
  },
});
