import React from 'react';
import { Box, Paper } from '@material-ui/core';
import type { App } from '@internal/plugin-gs-common';
import { getAppStatus } from '@internal/plugin-gs-common';
import { ContentRow } from '../UI/ContentRow';
import { DeploymentStatusCard } from '../UI/DeploymentStatusCard';
import { Heading } from '../UI/Heading';
import { useAppStatusDetails } from '../hooks/useDeploymentStatusDetails';

const StatusCard = ({
  status,
  lastTransitionTime,
  children,
}: {
  status: string;
  lastTransitionTime?: string;
  children?: React.ReactNode;
}) => {
  const { icon: Icon, color: iconColor, label } = useAppStatusDetails(status);

  return (
    <DeploymentStatusCard
      label={label}
      icon={<Icon />}
      iconColor={iconColor}
      lastTransitionTime={lastTransitionTime}
    >
      {children}
    </DeploymentStatusCard>
  );
};

type AppDetailsStatusProps = {
  app: App;
};

export const AppDetailsStatus = ({ app }: AppDetailsStatusProps) => {
  const status = getAppStatus(app);
  if (!status) {
    return (
      <Paper>
        <Box padding={2}>
          <Heading>No status information available</Heading>
        </Box>
      </Paper>
    );
  }

  const lastTransitionTime = app.status!.release.lastDeployed;
  const reason = app.status!.release.reason;

  return (
    <StatusCard status={status} lastTransitionTime={lastTransitionTime}>
      {reason && <ContentRow title="Reason">{reason}</ContentRow>}
    </StatusCard>
  );
};
