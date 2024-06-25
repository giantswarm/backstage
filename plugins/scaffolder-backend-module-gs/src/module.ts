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
        });
      },
    });
  },
});
