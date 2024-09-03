import React from 'react';
import { Box, Typography } from '@material-ui/core';
import { useResourceRequestStatusDetails } from '../../hooks';

type ResourceRequestStatusProps = {
  status: string;
};

export const ResourceRequestStatus = ({
  status,
}: ResourceRequestStatusProps) => {
  const { statusIcon: StatusIcon, label } =
    useResourceRequestStatusDetails(status);

  return (
    <Box display="flex" alignItems="center">
      <StatusIcon />
      <Typography variant="inherit" noWrap>
        {label}
      </Typography>
    </Box>
  );
};
