import { createApiRef } from '@backstage/core-plugin-api';

export const gsKubernetesApiRef = createApiRef<KubernetesApi>({
  id: 'plugin.gs.kubernetes',
});

export interface ClusterConfiguration {
  name: string;
  apiEndpoint: string;
  authProvider: string;
  oidcTokenProvider?: string;
}

export interface KubernetesApi {
  getCluster(clusterName: string): Promise<ClusterConfiguration>;
  proxy(options: {
    clusterName: string;
    path: string;
    init?: RequestInit;
  }): Promise<Response>;
}

export interface CustomResourceMatcher {
  group: string;
  apiVersion: string;
  plural: string;
}
