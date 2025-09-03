import { ReactNode } from 'react';
import { Box, Typography } from '@material-ui/core';

type ResourceStatusRowProps = {
  label: string;
  children: ReactNode;
};

export const DeploymentStatusRow = ({
  label,
  children,
}: ResourceStatusRowProps) => {
  return (
    <Box display="flex" alignItems="baseline" mt={1}>
      <Box minWidth={130}>
        <Typography variant="body2">{label}</Typography>
      </Box>

      <Box ml={2}>{children}</Box>
    </Box>
  );
};
