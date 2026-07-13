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
 * roadmapPlugin backend plugin
 *
 * REST proxy over the GitHub Projects v2 roadmap board, built on the
 * `@giantswarm-io/pro` core library (the same code that backs the pro MCP
 * server). Reads are served with the deployed GitHub App credentials and
 * cached; writes (board field updates, sub-issue linking) require the
 * caller's per-user GitHub OAuth token in the `X-GitHub-Token` header so
 * every mutation is attributed to the person who made it.
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
        const integrations = ScmIntegrations.fromConfig(config);
        const credentialsProvider =
          DefaultGithubCredentialsProvider.fromIntegrations(integrations);

        // `@giantswarm-io/pro` is ESM-only, while this plugin compiles to
        // CJS; the dynamic import keeps the module loadable from both.
        const pro = await import('@giantswarm-io/pro');

        httpRouter.use(
          await createRouter({
            logger,
            config,
            httpAuth,
            credentialsProvider,
            pro,
          }),
        );
      },
    });
  },
});
