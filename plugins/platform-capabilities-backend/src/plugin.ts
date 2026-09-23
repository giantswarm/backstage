import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { MusterServerClient } from '@giantswarm/backstage-plugin-gs-node';
import { createRouter } from './router';

/**
 * platform-capabilities backend plugin
 *
 * A gateway over giantswarm-platform-manager's tools for the Installations
 * page: the installations of the registry with the state of every platform
 * capability (`list_installations`), the dry run and the commit of enabling
 * or reconciling a capability (`enable_capability`, `reconcile_capability`),
 * the check of an installation against its inputs on record
 * (`verify_capability`), the live checks of the running installation
 * (`verify_installation`), the action records (`get_action`,
 * `list_actions`) and the manager's report of itself and the capability
 * definitions with their input schemas (`get_info`), all on the manager's
 * one muster registration (`platformCapabilities.muster`). Every call runs
 * as the signed-in person: the frontend forwards the caller's Dex ID token,
 * muster forwards it to the manager, which obtains the person's GitHub grant
 * from muster's token broker and reads the running installation as the
 * person. Nothing is composed here -- the page shows what the tools return.
 *
 * @public
 */
export const platformCapabilitiesPlugin = createBackendPlugin({
  pluginId: 'platform-capabilities',
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
              'platformCapabilities',
            ),
          }),
        );
      },
    });
  },
});
