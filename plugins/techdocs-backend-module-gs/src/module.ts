import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { techdocsPreparerExtensionPoint } from '@backstage/plugin-techdocs-node';
import { DocsUrlPreparer } from './docs-url-preparer';
import { Logger } from 'winston';

export const techdocsModuleGsPreparer = createBackendModule({
  pluginId: 'techdocs',
  moduleId: 'gs-preparer',
  register(reg) {
    reg.registerInit({
      deps: {
        preparerExtensionPoint: techdocsPreparerExtensionPoint,
        logger: coreServices.logger,
        reader: coreServices.urlReader,
      },
      async init({ preparerExtensionPoint, logger, reader }) {
        preparerExtensionPoint.registerPreparer(
          'url',
          DocsUrlPreparer.fromConfig({
            logger: logger as Logger,
            reader,
          }),
        );
      },
    });
  },
});
