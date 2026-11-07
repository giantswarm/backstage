import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { MusterServerClient } from '@giantswarm/backstage-plugin-gs-node';
import { DatabaseBoardReadStore } from './BoardReadStore';
import { createRouter, MAX_READ_AGE_MS } from './router';

/**
 * roadmapPlugin backend plugin
 *
 * REST API over a GitHub Projects board (the giantswarm roadmap), consumed by
 * the roadmap frontend plugin. Every board read and write runs as the
 * signed-in person: the frontend forwards the caller's Dex ID token, muster
 * runs pro's board tools with the person's own GitHub grant
 * (`roadmap.muster`). No GitHub credential exists in the portal. Each
 * person's reads are kept in the plugin's database, so every backend
 * instance serves them, after a restart too.
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
        const store = await DatabaseBoardReadStore.create(database);
        await scheduler.scheduleTask({
          id: 'roadmap-prune-board-reads',
          frequency: { hours: 1 },
          timeout: { minutes: 5 },
          fn: async () => {
            const pruned = await store.prune(Date.now() - MAX_READ_AGE_MS);
            logger.info('Pruned old roadmap board reads', { pruned });
          },
        });
        httpRouter.use(
          await createRouter({
            logger,
            config,
            httpAuth,
            pro: MusterServerClient.fromConfig(config, logger, 'roadmap'),
            store,
          }),
        );
      },
    });
  },
});
