import React from 'react';
import { Box, Typography } from '@material-ui/core';
import { useHelmReleaseStatusDetails } from '../../hooks';

type HelmReleaseStatusProps = {
  status: string;
};

export const HelmReleaseStatus = ({ status }: HelmReleaseStatusProps) => {
  const { statusIcon: StatusIcon, label } = useHelmReleaseStatusDetails(status);

  return (
    <Box display="flex" alignItems="center">
      <StatusIcon />
      <Typography variant="inherit" noWrap>
        {label}
      </Typography>
    </Box>
  );
};
