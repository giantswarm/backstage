import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useQuery } from '@tanstack/react-query';
import {
  createSelfSubjectAccessReview,
  ResourceAttributes,
} from '../utils/selfSubjectAccessReview';

/**
 * A verdict is cheap to re-check but changes rarely, so keep it warm for a few
 * minutes and let a remount revalidate in the background.
 */
const STALE_TIME = 5 * 60 * 1000;

/**
 * Checks whether the signed-in user is allowed to perform a verb on a kind of
 * Kubernetes resource, so write affordances can be hidden from read-only users.
 *
 * Fails closed: both the in-flight state and a failed review report
 * `allowed: false`.
 */
export function useSelfSubjectAccessReview(
  cluster: string,
  resourceAttributes: ResourceAttributes,
  options: { enabled?: boolean } = {},
) {
  const kubernetesApi = useApi(kubernetesApiRef);
  const { group, resource, namespace, name, subresource, verb } =
    resourceAttributes;

  const queryInfo = useQuery({
    // Deliberately not prefixed with 'cluster': `useClusterQueries` treats every
    // active query under that prefix as a cluster read, and a permission probe
    // must not show up in the per-cluster loading/error banners.
    queryKey: [
      'selfSubjectAccessReview',
      cluster,
      group ?? '',
      resource,
      namespace ?? '',
      name ?? '',
      subresource ?? '',
      verb,
    ],
    queryFn: () =>
      createSelfSubjectAccessReview({
        kubernetesApi,
        cluster,
        resourceAttributes,
      }),
    enabled: (options.enabled ?? true) && Boolean(cluster),
    staleTime: STALE_TIME,
    // A failed review means "assume not allowed" — retrying would only add load
    // for a verdict we are not going to act on.
    retry: false,
  });

  return {
    allowed: queryInfo.data === true,
    isLoading: queryInfo.isLoading,
  };
}
