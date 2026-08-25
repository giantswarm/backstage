import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { policyReporterServiceRef } from './services/PolicyReporterService';

/**
 * policyReporterPlugin backend plugin
 *
 * @public
 */
export const policyReporterPlugin = createBackendPlugin({
  pluginId: 'policy-reporter',
  register(env) {
    env.registerInit({
      deps: {
        httpAuth: coreServices.httpAuth,
        httpRouter: coreServices.httpRouter,
        policyReporter: policyReporterServiceRef,
      },
      async init({ httpAuth, httpRouter, policyReporter }) {
        httpRouter.use(
          await createRouter({
            httpAuth,
            policyReporter,
          }),
        );
      },
    });
  },
});
