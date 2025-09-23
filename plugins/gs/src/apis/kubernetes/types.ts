import { createApiRef } from '@backstage/core-plugin-api';
import { KubernetesAuthProvidersApi } from './KubernetesAuthProviders';

export interface CustomResourceMatcher {
  group: string;
  apiVersion: string;
  plural: string;
}

export const kubernetesAuthProvidersApiRef =
  createApiRef<KubernetesAuthProvidersApi>({
    id: 'plugin.gs.kubernetes-auth-providers',
  });
