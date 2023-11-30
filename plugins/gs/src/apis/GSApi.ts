import { createApiRef } from '@backstage/core-plugin-api';
import { ICluster } from '../model/services/mapi/capiv1beta1';

/** @public */
export const gsApiRef = createApiRef<GSApi>({
  id: 'plugin.gs.service',
});

/**
 * A client for interacting with Giant Swarm Management API.
 *
 * @public
 */
export type GSApi = {
  listClusters: (options: { installationName: string; namespace?: string; }) => Promise<ICluster[]>;
}
