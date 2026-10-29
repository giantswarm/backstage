import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { scaffolderActionsExtensionPoint } from '@backstage/plugin-scaffolder-node';
import { scaffolderTemplatingExtensionPoint } from '@backstage/plugin-scaffolder-node/alpha';
import type { JsonValue } from '@backstage/types';
import { containerRegistryServiceRef } from '@giantswarm/backstage-plugin-gs-node';
import { createKubeApplyAction } from './actions/kubeApply';
import { createOciTagExistsAction } from './actions/ociTagExists';
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
        containerRegistry: containerRegistryServiceRef,
      },
      async init({
        actionsExtensionPoint,
        templatingExtensionPoint,
        config,
        logger,
        containerRegistry,
      }) {
        const kubernetesClientFactory = new KubernetesClientFactory({
          config,
          logger,
        });
        actionsExtensionPoint.addActions(
          createKubeApplyAction(kubernetesClientFactory),
          createOciTagExistsAction(containerRegistry),
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
