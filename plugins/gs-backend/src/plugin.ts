import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { actionsRegistryServiceRef } from '@backstage/backend-plugin-api/alpha';
import {
  createFindScaffolderTemplatesAction,
  createRetrieveScaffolderTemplateAction,
  createValidateTemplateValuesAction,
  createRunScaffolderTemplateAction,
  createGetScaffolderTaskAction,
  createMonitorScaffolderTaskAction,
} from './actions';

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
        logger: coreServices.logger,
        discovery: coreServices.discovery,
        catalog: catalogServiceRef,
        actionsRegistry: actionsRegistryServiceRef,
      },
      async init({ auth, logger, discovery, catalog, actionsRegistry }) {
        // Register all scaffolder actions
        createFindScaffolderTemplatesAction({
          catalog,
          actionsRegistry,
        });
        createRetrieveScaffolderTemplateAction({
          catalog,
          actionsRegistry,
        });
        createValidateTemplateValuesAction({
          catalog,
          actionsRegistry,
        });
        createRunScaffolderTemplateAction({
          discovery,
          catalog,
          actionsRegistry,
          auth,
        });
        createGetScaffolderTaskAction({
          actionsRegistry,
          auth,
          discovery,
        });
        createMonitorScaffolderTaskAction({
          actionsRegistry,
          auth,
          discovery,
        });

        logger.info(
          'Successfully registered all scaffolder actions as MCP tools',
        );
      },
    });
  },
});
