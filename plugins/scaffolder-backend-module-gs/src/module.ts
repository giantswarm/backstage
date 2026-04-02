import { createBackendModule } from '@backstage/backend-plugin-api';
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
      },
      async init({ templatingExtensionPoint }) {
        templatingExtensionPoint.addTemplateFilters({
          parseClusterRef: (ref: JsonValue) => parseClusterRef(ref as string),
          fromJson: (value: JsonValue) => {
            if (typeof value !== 'string') return value;
            try {
              return JSON.parse(value);
            } catch {
              return {};
            }
          },
        });
      },
    });
  },
});
