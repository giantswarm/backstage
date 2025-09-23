import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { kubernetesAuthStrategyExtensionPoint } from '@backstage/plugin-kubernetes-node';
import { PinnipedStrategy } from './PinnipedStrategy';

export const kubernetesModulePinniped = createBackendModule({
  pluginId: 'kubernetes',
  moduleId: 'pinniped',
  register(reg) {
    reg.registerInit({
      deps: {
        logger: coreServices.logger,
        authStrategy: kubernetesAuthStrategyExtensionPoint,
      },
      async init({ logger, authStrategy }) {
        authStrategy.addAuthStrategy('pinniped', new PinnipedStrategy(logger));
      },
    });
  },
});
