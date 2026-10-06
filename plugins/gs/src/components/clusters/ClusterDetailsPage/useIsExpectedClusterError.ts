import { useCallback } from 'react';
import { isNotFound } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useCurrentCluster } from './useCurrentCluster';

/**
 * Whether an error reading one of the current cluster's resources is expected:
 * while the cluster is being deleted, its resources disappear one by one, so
 * a resource that is not found is not a failure.
 */
export function useIsExpectedClusterError(): (
  error: Error | null | undefined,
) => boolean {
  const { isDeleting } = useCurrentCluster();

  return useCallback(error => isDeleting && isNotFound(error), [isDeleting]);
}
