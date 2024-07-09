import React from 'react';
import { Box } from '@material-ui/core';

type DeploymentActionsProps = {
  installationName: string;
  clusterName?: string;
  kind: string;
  name: string;
  namespace?: string;
};

export const DeploymentActions = (_props: DeploymentActionsProps) => {
  return <Box display="flex" alignItems="center" />;
};
