import React from 'react';
import { Box, Typography } from '@material-ui/core';
import { useAppStatusDetails } from '../hooks/useDeploymentStatusDetails';

type AppStatusProps = {
  status: string;
};

export const AppStatus = ({ status }: AppStatusProps) => {
  const { statusIcon: StatusIcon, label } = useAppStatusDetails(status);

  return (
    <Box display="flex" alignItems="center">
      <StatusIcon />
      <Typography variant="inherit" noWrap>
        {label}
      </Typography>
    </Box>
  );
};
