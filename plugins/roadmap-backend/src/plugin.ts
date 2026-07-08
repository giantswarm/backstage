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
 * Serves the GitHub Projects roadmap board through the `@giantswarm/pro`
 * board core, consumed by the roadmap frontend plugin. Reads use the
 * deployed GitHub App credentials (cached, identical for every viewer);
 * writes require a per-user GitHub OAuth token passed by the frontend in
 * the X-GitHub-Token header, so board mutations are attributed to the
 * acting user on GitHub.
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

        // Dynamic import: @giantswarm/pro is ESM-only. Node >= 22.12 loads
        // it fine either way, but keeping the import lazy avoids a hard
        // module-format dependency at plugin load time.
        const pro = await import('@giantswarm/pro');

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
