import React from 'react';
import { Box } from '@material-ui/core';
import { GrafanaDashboardLink } from '../../UI';

type DeploymentActionsProps = {
  installationName: string;
  clusterName?: string;
  kind: string;
  name: string;
  namespace?: string;
  grafanaDashboard?: string;
};

export const DeploymentActions = ({
  installationName,
  clusterName,
  name,
  grafanaDashboard,
}: DeploymentActionsProps) => {
  return (
    <Box display="flex" alignItems="center">
      {grafanaDashboard && (
        <GrafanaDashboardLink
          dashboard={grafanaDashboard}
          installationName={installationName}
          clusterName={clusterName}
          applicationName={name}
          tooltip="Open Grafana dashboard for this application"
        />
      )}
    </Box>
  );
};
