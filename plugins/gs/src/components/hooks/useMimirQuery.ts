import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  kubernetesApiRef,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';
import { useQuery } from '@tanstack/react-query';
import { mimirApiRef } from '../../apis/mimir';
import { MimirQueryResponse } from '../../apis/mimir/types';
import { useMimirAvailable } from './useMimirAvailable';

export function useMimirQuery(options: {
  installationName: string;
  query: string;
  enabled?: boolean;
  refetchInterval?: number | false;
}) {
  const { installationName, query, enabled = true, refetchInterval } = options;

  const mimirApi = useApi(mimirApiRef);
  const kubernetesApi = useApi(kubernetesApiRef);
  const kubernetesAuthProvidersApi = useApi(kubernetesAuthProvidersApiRef);

  // Installations without Mimir (`mimirEnabled: false`) never get queried:
  // the query would only ever fail, and "metrics unavailable" is the truth
  // callers should render. `undefined` means the installations config is
  // still loading — the query stays disabled and `isLoading` stays true.
  const isAvailable = useMimirAvailable(installationName);

  const wanted = Boolean(enabled && installationName && query);

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
    enabled: wanted && isAvailable === true,
    staleTime: 30_000,
    refetchInterval,
  });

  return useMemo(
    () => ({
      data,
      // While the installations config is loading, availability is unknown and
      // the query is disabled — report loading so callers don't flash an empty
      // state that then resolves either way.
      isLoading: isLoading || (wanted && isAvailable === undefined),
      error: error as Error | null,
      isAvailable,
    }),
    [data, isLoading, error, wanted, isAvailable],
  );
}
