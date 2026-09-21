import {
  coreServices,
  createBackendPlugin,
  LoggerService,
} from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import {
  MusterMcpClient,
  MusterServerClient,
  readMusterInstallationsFromConfig,
  readMusterServerRef,
} from '@giantswarm/backstage-plugin-gs-node';
import { createRouter } from './router';

/**
 * The manager's live surface: its second registration in the same muster
 * installation, `platformCapabilities.muster.liveServer` (default
 * `<server>-live`, the manager's own convention), which muster forwards the
 * person's own token to; its tools are `x_<liveServer>_<tool>`. Undefined
 * without the manager's block.
 */
function liveClient(
  config: Config,
  logger: LoggerService,
): MusterServerClient | undefined {
  const ref = readMusterServerRef(config, 'platformCapabilities');
  if (!ref) {
    return undefined;
  }
  const server =
    config.getOptionalString('platformCapabilities.muster.liveServer') ??
    `${ref.server}-live`;
  const installation = readMusterInstallationsFromConfig(config, logger).get(
    ref.installation,
  );
  if (!installation) {
    return undefined;
  }
  return new MusterServerClient(
    new MusterMcpClient(installation, logger),
    server,
    server,
  );
}

/**
 * platform-capabilities backend plugin
 *
 * A gateway over giantswarm-platform-manager's tools for the Installations
 * page: the installations of the registry with the state of every platform
 * capability (`list_installations`), the dry run and the commit of enabling
 * or reconciling a capability (`enable_capability`, `reconcile_capability`),
 * the check of an installation against its inputs on record
 * (`verify_capability`), the live checks of the running installation on the
 * manager's live surface (`verify_installation`), the action records
 * (`get_action`, `list_actions`) and the manager's report of itself and the
 * capability definitions with their input schemas (`get_info`). Every call
 * runs as the signed-in person: the frontend forwards the caller's Dex ID
 * token, muster forwards it to the manager, which obtains the person's
 * GitHub grant from muster's token broker (`platformCapabilities.muster`);
 * the live surface reads the installation with the forwarded token itself.
 * Nothing is composed here -- the page shows what the tools return.
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
            live: liveClient(config, logger),
          }),
        );
      },
    });
  },
});
