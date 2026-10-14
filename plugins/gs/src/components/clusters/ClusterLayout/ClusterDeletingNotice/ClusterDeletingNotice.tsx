import { Alert } from '@backstage/ui';
import { Cluster } from '@giantswarm/backstage-plugin-kubernetes-react';
import { DateComponent } from '../../../UI';

export type ClusterDeletingNoticeProps = {
  cluster: Cluster;
  /** Why the last re-read of the cluster failed, while the page shows the last one read. */
  refreshError: Error | null;
};

/** Says the cluster is being deleted and the page follows the deletion. */
export const ClusterDeletingNotice = ({
  cluster,
  refreshError,
}: ClusterDeletingNoticeProps) => {
  const deletionTimestamp = cluster.getDeletionTimestamp();

  return (
    <Alert
      status={refreshError ? 'warning' : 'info'}
      icon
      mb="4"
      title="This cluster is being deleted"
      description={
        <>
          {deletionTimestamp ? (
            <>
              Deletion was requested{' '}
              <DateComponent value={deletionTimestamp} relative />.{' '}
            </>
          ) : null}
          Resources that belong to the cluster disappear as the deletion
          proceeds, so some details may be missing.{' '}
          {refreshError
            ? `The page could not re-read the cluster and keeps trying: ${refreshError.message}`
            : 'This page updates by itself.'}
        </>
      }
    />
  );
};
