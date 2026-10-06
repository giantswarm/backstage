import { ReactNode, useCallback } from 'react';
import {
  ErrorItem,
  ErrorsProvider,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useIsExpectedClusterError } from './useIsExpectedClusterError';

/**
 * Collects the errors of a cluster details tab, leaving out the ones expected
 * for the cluster's state.
 */
export const ClusterErrorsProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const isExpected = useIsExpectedClusterError();

  const ignoreError = useCallback(
    (item: ErrorItem) =>
      item.type !== 'incompatibility' && isExpected(item.error),
    [isExpected],
  );

  return <ErrorsProvider ignoreError={ignoreError}>{children}</ErrorsProvider>;
};
