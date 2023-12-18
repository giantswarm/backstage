import { createApiRef } from '@backstage/core-plugin-api';
import { ICluster } from '../model/services/mapi/capiv1beta1';
import { IApp } from '../model/services/mapi/applicationv1alpha1';
import { IHelmRelease } from '../model/services/mapi/helmv2beta1';

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
  listClusters: (options: {
    installationName: string;
    namespace?: string;
  }) => Promise<ICluster[]>;

  listApps: (options: {
    installationName: string;
    namespace?: string;
  }) => Promise<IApp[]>;

  getApp: (options: {
    installationName: string;
    namespace: string;
    name: string;
  }) => Promise<IApp>;

  listHelmReleases: (options: {
    installationName: string;
    namespace?: string;
  }) => Promise<IHelmRelease[]>;

  getHelmRelease: (options: {
    installationName: string;
    namespace: string;
    name: string;
  }) => Promise<IHelmRelease>;
}
