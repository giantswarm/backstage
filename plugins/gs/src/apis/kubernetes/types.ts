import { createApiRef } from '@backstage/core-plugin-api';
import { KubernetesApi } from '@backstage/plugin-kubernetes-react';

export const gsKubernetesApiRef = createApiRef<KubernetesApi>({
  id: 'plugin.gs.kubernetes',
});

export interface ClusterConfiguration {
  name: string;
  apiEndpoint: string;
  authProvider: string;
  oidcTokenProvider?: string;
}

export interface CustomResourceMatcher {
  group: string;
  apiVersion: string;
  plural: string;
}
