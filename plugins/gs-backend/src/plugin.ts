import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { gsServiceRef } from '@giantswarm/backstage-plugin-gs-node';

/**
 * gsPlugin backend plugin
 *
 * @public
 */
export const gsPlugin = createBackendPlugin({
  pluginId: 'gs',
  register(env) {
    env.registerInit({
      deps: {
        auth: coreServices.auth,
        httpAuth: coreServices.httpAuth,
        httpRouter: coreServices.httpRouter,
        discovery: coreServices.discovery,
        gsService: gsServiceRef,
      },
      async init({ auth, httpAuth, httpRouter, discovery, gsService }) {
        httpRouter.use(
          await createRouter({
            auth,
            httpAuth,
            discovery,
            gsService,
          }),
        );
      },
    });
  },
});
