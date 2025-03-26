import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import {
  scaffolderActionsExtensionPoint,
  scaffolderTemplatingExtensionPoint,
} from '@backstage/plugin-scaffolder-node/alpha';
import type { JsonValue } from '@backstage/types';
import { parseClusterRef } from './filters/parseClusterRef';
import { kubernetesActions } from './actions';
import { KubernetesClientFactory } from './lib/kubernetes-client-factory';

export const scaffolderModuleGS = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'gs',
  register(reg) {
    reg.registerInit({
      deps: {
        actionsExtensionPoint: scaffolderActionsExtensionPoint,
        templatingExtensionPoint: scaffolderTemplatingExtensionPoint,
        config: coreServices.rootConfig,
        logger: coreServices.logger,
      },
      async init({
        actionsExtensionPoint,
        templatingExtensionPoint,
        logger,
        config,
      }) {
        const kubeClientFactory = new KubernetesClientFactory({
          logger,
          config,
        });
        actionsExtensionPoint.addActions(
          ...kubernetesActions(kubeClientFactory),
        );

        templatingExtensionPoint.addTemplateFilters({
          parseClusterRef: (ref: JsonValue) => parseClusterRef(ref as string),
        });
      },
    });
  },
});
