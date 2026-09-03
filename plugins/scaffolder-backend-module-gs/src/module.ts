import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import { scaffolderTemplatingExtensionPoint } from '@backstage/plugin-scaffolder-node/alpha';
import type { JsonValue } from '@backstage/types';
import { createKubeApplyAction } from './actions/kubeApply';
import { parseClusterRef } from './filters/parseClusterRef';
import { KubernetesClientFactory } from './lib/KubernetesClientFactory';

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
        config,
        logger,
      }) {
        const kubernetesClientFactory = new KubernetesClientFactory({
          config,
          logger,
        });
        actionsExtensionPoint.addActions(
          createKubeApplyAction(kubernetesClientFactory),
        );

        templatingExtensionPoint.addTemplateFilters({
          parseClusterRef: (ref: JsonValue) => parseClusterRef(ref as string),
          fromJson: (value: JsonValue) => {
            if (typeof value !== 'string') return value;
            try {
              return JSON.parse(value);
            } catch (e) {
              logger.warn(
                `fromJson filter: failed to parse JSON, returning empty object. Input (first 200 chars): ${String(value).slice(0, 200)}`,
              );
              return {};
            }
          },
        });
      },
    });
  },
});
