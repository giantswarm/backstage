import React from 'react';
import { Box } from '@material-ui/core';
import { ApplicationLink, GrafanaDashboardLink } from '../../UI';

type DeploymentActionsProps = {
  installationName: string;
  clusterName?: string;
  kind: string;
  name: string;
  namespace?: string;
  grafanaDashboard?: string;
  ingressHost?: string;
};

export const DeploymentActions = ({
  installationName,
  clusterName,
  name,
  grafanaDashboard,
  ingressHost,
}: DeploymentActionsProps) => {
  return (
    <Box display="flex" flexDirection="column" gridGap={4}>
      {ingressHost && (
        <ApplicationLink ingressHost={ingressHost} tooltip="Open application" />
      )}
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
