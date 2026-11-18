import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { MusterServerClient } from '@giantswarm/backstage-plugin-gs-node';
import { DatabaseContentReadStore } from './ContentReadStore';
import { createRouter, STORED_CONTENT_RETENTION_MS } from './router';

/**
 * plansPlugin backend plugin
 *
 * Thin REST API over plan repositories (e.g. `<owner>/<plans-repo>`),
 * consumed by the plans frontend plugin to render proposed (open PR) and
 * merged plan documents and to read/write PR discussion and inline review
 * comments. Every GitHub call runs as the signed-in person: the frontend
 * forwards the caller's Dex ID token, muster holds the person's GitHub grant
 * and executes the GitHub MCP server's tools with it (`plans.muster`). No
 * GitHub credential exists in the portal. Each person's file reads are kept
 * in the plugin's database, so every backend instance serves them.
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
        database: coreServices.database,
        scheduler: coreServices.scheduler,
      },
      async init({
        httpRouter,
        logger,
        config,
        httpAuth,
        database,
        scheduler,
      }) {
        const contentStore = await DatabaseContentReadStore.create(database);
        await scheduler.scheduleTask({
          id: 'plans-prune-content-reads',
          frequency: { hours: 1 },
          timeout: { minutes: 5 },
          fn: async () => {
            const pruned = await contentStore.prune(
              Date.now() - STORED_CONTENT_RETENTION_MS,
            );
            logger.info('Pruned old plans content reads', { pruned });
          },
        });
        httpRouter.use(
          await createRouter({
            logger,
            config,
            httpAuth,
            github: MusterServerClient.fromConfig(config, logger, 'plans'),
            contentStore,
          }),
        );
      },
    });
  },
});
