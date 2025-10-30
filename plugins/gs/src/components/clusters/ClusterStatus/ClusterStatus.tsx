import {
  StatusError,
  StatusOK,
  StatusWarning,
} from '@backstage/core-components';
import { Box, Typography } from '@material-ui/core';
import { toSentenceCase } from '../../utils/helpers';

export const ClusterStatuses = {
  Deleting: 'deleting',
  Creating: 'creating',
  Ready: 'ready',
} as const;

type ClusterStatusProps = {
  status: string;
};

export const ClusterStatus = ({ status }: ClusterStatusProps) => {
  const statusLabel = toSentenceCase(status);

  return (
    <Box display="flex" alignItems="center">
      <Box marginTop="-5px">
        <StatusIcon status={status} />
      </Box>
      <Typography variant="inherit" noWrap>
        {statusLabel}
      </Typography>
    </Box>
  );
};

function StatusIcon({ status }: { status?: string }) {
  if (!status) {
    return null;
  }

  switch (status) {
    case ClusterStatuses.Creating:
      return <StatusWarning />;

    case ClusterStatuses.Deleting:
      return <StatusError />;

    default:
      return <StatusOK />;
  }
}
