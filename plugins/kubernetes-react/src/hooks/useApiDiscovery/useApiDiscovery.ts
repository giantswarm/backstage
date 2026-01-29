import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useQuery } from '@tanstack/react-query';
import { APIGroup } from '../../lib/k8s/ApiDiscovery';

const CACHE_TIME = 5 * 60 * 1000; // 5 minutes

interface UseApiDiscoveryOptions {
  enabled?: boolean;
}

/**
 * Hook to discover available API versions for a Kubernetes API group.
 * Fetches from /apis/{group} endpoint and returns available versions
 * and the server's preferred version.
 *
 * @param cluster - The cluster name to query
 * @param group - The API group name (e.g., "cluster.x-k8s.io")
 * @param options - Query options
 * @returns Query result with APIGroup data
 */
export function useApiDiscovery(
  cluster: string,
  group: string,
  options: UseApiDiscoveryOptions = {},
) {
  const kubernetesApi = useApi(kubernetesApiRef);
  const { enabled = true } = options;

  return useQuery({
    queryKey: ['cluster', cluster, 'api-discovery', group],
    queryFn: async (): Promise<APIGroup> => {
      const path = `/apis/${group}`;
      const response = await kubernetesApi.proxy({
        clusterName: cluster,
        path,
      });

      if (!response.ok) {
        const error = new Error(
          `Failed to discover API group ${group} from ${cluster}. Reason: ${response.statusText}.`,
        );
        error.name = response.status === 404 ? 'NotFoundError' : error.name;
        error.name = response.status === 403 ? 'ForbiddenError' : error.name;
        throw error;
      }

      const apiGroup: APIGroup = await response.json();
      return apiGroup;
    },
    enabled: enabled && Boolean(cluster) && Boolean(group),
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME,
    retry: false,
  });
}
