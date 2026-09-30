import { ReactNode, useCallback } from 'react';
import {
  ErrorItem,
  ErrorsProvider,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useCurrentCluster } from './useCurrentCluster';
import { calculateClusterStatus } from '../utils';
import { ClusterStatuses } from '../ClusterStatus';

export function isNotFoundErrorItem(item: ErrorItem) {
  return item.type === 'error' && item.error?.name === 'NotFoundError';
}

/**
 * Collects the errors of a cluster details tab. While the cluster is being
 * deleted, the resources that belong to it disappear one by one, so a
 * resource that is not found is expected and not reported.
 */
export const ClusterErrorsProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const { cluster } = useCurrentCluster();
  const isDeleting =
    calculateClusterStatus(cluster) === ClusterStatuses.Deleting;

  const ignoreError = useCallback(
    (item: ErrorItem) => isDeleting && isNotFoundErrorItem(item),
    [isDeleting],
  );

  return <ErrorsProvider ignoreError={ignoreError}>{children}</ErrorsProvider>;
};
