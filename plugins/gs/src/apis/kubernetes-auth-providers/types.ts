import { createApiRef } from '@backstage/core-plugin-api';

export interface KubernetesAuthProvider {
  getCredentials(): Promise<{ token?: string }>;
}

export const gsKubernetesAuthProvidersApiRef =
  createApiRef<KubernetesAuthProvidersApi>({
    id: 'plugin.gs.kubernetes-auth-providers',
  });

export interface KubernetesAuthProvidersApi {
  getCredentials(authProvider: string): Promise<{ token?: string }>;
}
