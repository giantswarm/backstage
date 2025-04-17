import React from 'react';
import { Box, Typography } from '@material-ui/core';
import {
  StatusError,
  StatusOK,
  StatusWarning,
} from '@backstage/core-components';
import { toSentenceCase } from '../../utils/helpers';

type DeploymentStatusProps = {
  status: string;
};

export const DeploymentStatus = ({ status }: DeploymentStatusProps) => {
  const label = toSentenceCase(status.replace(/-/g, ' '));
  let StatusIcon;
  switch (status) {
    case 'successful':
      StatusIcon = StatusOK;
      break;
    case 'pending':
      StatusIcon = StatusWarning;
      break;
    default:
      StatusIcon = StatusError;
      break;
  }

  return (
    <Box display="flex" alignItems="center">
      <Box marginTop="-5px">
        <StatusIcon />
      </Box>
      <Typography variant="inherit" noWrap>
        {label}
      </Typography>
    </Box>
  );
};
