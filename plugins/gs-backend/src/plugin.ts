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
        logger: coreServices.logger,
        catalog: catalogServiceRef,
        actionsRegistry: actionsRegistryServiceRef,
      },
      async init({ logger, catalog, actionsRegistry }) {
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
          catalog,
          actionsRegistry,
        });
        createGetScaffolderTaskAction({ actionsRegistry });

        logger.info(
          'Successfully registered all scaffolder actions as MCP tools',
        );
      },
    });
  },
});
