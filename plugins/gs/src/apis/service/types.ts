import { createApiRef } from '@backstage/core-plugin-api';

export const gsServiceApiRef = createApiRef<GSServiceApi>({
  id: 'plugin.gs.service',
});

export type GSServiceApi = {
  updateClusters: (
    installationName: string,
    kubernetesHeaders: Record<string, string>,
  ) => Promise<void>;
};
