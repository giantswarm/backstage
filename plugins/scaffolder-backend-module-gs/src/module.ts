import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { scaffolderTemplatingExtensionPoint } from '@backstage/plugin-scaffolder-node/alpha';
import type { JsonValue } from '@backstage/types';
import { parseClusterRef } from './filters/parseClusterRef';

export const scaffolderModuleGS = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'gs',
  register(reg) {
    reg.registerInit({
      deps: {
        templatingExtensionPoint: scaffolderTemplatingExtensionPoint,
        logger: coreServices.logger,
      },
      async init({ templatingExtensionPoint, logger }) {
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
