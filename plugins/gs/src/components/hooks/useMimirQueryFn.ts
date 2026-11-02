import { useCallback } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  kubernetesApiRef,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';
import { mimirApiRef } from '../../apis/mimir';
import { MimirQueryResponse } from '../../apis/mimir/types';

/**
 * A react-query `queryFn` body for an instant Mimir query on one
 * installation, authenticated with the user's token for that installation.
 */
export function useMimirQueryFn(): (
  installationName: string,
  query: string,
) => Promise<MimirQueryResponse> {
  const mimirApi = useApi(mimirApiRef);
  const kubernetesApi = useApi(kubernetesApiRef);
  const kubernetesAuthProvidersApi = useApi(kubernetesAuthProvidersApiRef);

  return useCallback(
    async (installationName: string, query: string) => {
      const cluster = await kubernetesApi.getCluster(installationName);
      if (!cluster) {
        throw new Error(`Cluster ${installationName} not found`);
      }

      const authProvider =
        cluster.authProvider === 'oidc'
          ? `${cluster.authProvider}.${cluster.oidcTokenProvider}`
          : cluster.authProvider;

      const credentials =
        await kubernetesAuthProvidersApi.getCredentials(authProvider);

      if (!credentials.token) {
        throw new Error(
          `No OIDC token available for installation "${installationName}"`,
        );
      }

      return mimirApi.query({
        installationName,
        query,
        oidcToken: credentials.token,
      });
    },
    [mimirApi, kubernetesApi, kubernetesAuthProvidersApi],
  );
}
