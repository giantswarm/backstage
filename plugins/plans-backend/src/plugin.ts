import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import {
  DefaultGithubCredentialsProvider,
  ScmIntegrations,
} from '@backstage/integration';
import { createRouter } from './router';

/**
 * plansPlugin backend plugin
 *
 * Thin REST proxy over the GitHub API for plan repositories (e.g.
 * giantswarm/bumblebee-plans), consumed by the plans frontend plugin to
 * render proposed (open PR) and merged plan documents and to read/write PR
 * discussion and inline review comments. GitHub access uses the deployed
 * GitHub App credentials via the standard integrations config.
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
        userInfo: coreServices.userInfo,
      },
      async init({ httpRouter, logger, config, httpAuth, userInfo }) {
        const integrations = ScmIntegrations.fromConfig(config);
        const credentialsProvider =
          DefaultGithubCredentialsProvider.fromIntegrations(integrations);

        httpRouter.use(
          await createRouter({
            logger,
            config,
            httpAuth,
            userInfo,
            credentialsProvider,
          }),
        );
      },
    });
  },
});
