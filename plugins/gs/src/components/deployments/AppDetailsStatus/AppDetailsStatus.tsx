import React from 'react';
import { Box, Paper } from '@material-ui/core';
import type { App } from '@giantswarm/backstage-plugin-gs-common';
import { getAppStatus } from '@giantswarm/backstage-plugin-gs-common';
import { useAppStatusDetails } from '../../hooks';
import {
  ContentRow,
  DeploymentStatusCard,
  Heading,
  ScrollContainer,
  StatusMessage,
} from '../../UI';

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
          <Heading level="h3">No status information available</Heading>
        </Box>
      </Paper>
    );
  }

  const lastTransitionTime = app.status!.release.lastDeployed;
  const reason = app.status!.release.reason;

  return (
    <StatusCard status={status} lastTransitionTime={lastTransitionTime}>
      {reason && (
        <ContentRow title="Reason">
          <ScrollContainer>
            <StatusMessage>
              <code>{reason}</code>
            </StatusMessage>
          </ScrollContainer>
        </ContentRow>
      )}
    </StatusCard>
  );
};
