import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { kubernetesClusterSupplierExtensionPoint } from '@backstage/plugin-kubernetes-node';
import { getCombinedClusterSupplier } from './cluster-locator';
import { gsServiceRef } from '@giantswarm/backstage-plugin-gs-node';

export const kubernetesModuleGS = createBackendModule({
  pluginId: 'kubernetes',
  moduleId: 'gs',
  register(reg) {
    reg.registerInit({
      deps: {
        rootConfig: coreServices.rootConfig,
        logger: coreServices.logger,
        clusterSupplier: kubernetesClusterSupplierExtensionPoint,
        gsService: gsServiceRef,
      },
      async init({ rootConfig, logger, clusterSupplier, gsService }) {
        clusterSupplier.addClusterSupplier(
          getCombinedClusterSupplier(rootConfig, logger, gsService),
        );
      },
    });
  },
});
