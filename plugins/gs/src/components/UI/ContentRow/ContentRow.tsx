import React from 'react';
import { Box, Typography } from '@material-ui/core';

export const ContentRow = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => {
  return (
    <Box>
      <Typography variant="subtitle2">{title}</Typography>
      <Typography variant="body2">{children}</Typography>
    </Box>
  );
};
