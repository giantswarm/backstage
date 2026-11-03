import { useCallback } from 'react';
import { isObjectNotFound } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useCurrentCluster } from './useCurrentCluster';

/**
 * Whether an error reading one of the current cluster's resources is expected:
 * while the cluster is being deleted, its objects disappear one by one, so an
 * object that is not found is not a failure. A 404 for an API path the
 * installation does not serve still is.
 */
export function useIsExpectedClusterError(): (
  error: Error | null | undefined,
) => boolean {
  const { isDeleting } = useCurrentCluster();

  return useCallback(
    error => isDeleting && isObjectNotFound(error),
    [isDeleting],
  );
}
