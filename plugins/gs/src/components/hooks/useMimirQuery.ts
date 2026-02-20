import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  kubernetesApiRef,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';
import { useQuery } from '@tanstack/react-query';
import { mimirApiRef } from '../../apis/mimir';
import { MimirQueryResponse } from '../../apis/mimir/types';

export function useMimirQuery(options: {
  installationName: string;
  query: string;
  enabled?: boolean;
}) {
  const { installationName, query, enabled = true } = options;

  const mimirApi = useApi(mimirApiRef);
  const kubernetesApi = useApi(kubernetesApiRef);
  const kubernetesAuthProvidersApi = useApi(kubernetesAuthProvidersApiRef);

  const { data, isLoading, error } = useQuery<MimirQueryResponse, Error>({
    queryKey: ['mimir-query', installationName, query],
    queryFn: async () => {
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
    enabled: Boolean(enabled && installationName && query),
    staleTime: 30_000,
    retry: 1,
  });

  return useMemo(
    () => ({ data, isLoading, error: error as Error | null }),
    [data, isLoading, error],
  );
}
