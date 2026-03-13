import { Box, Paper, styled, Typography } from '@material-ui/core';
import { useAppStatusDetails } from '../../../../../hooks';
import {
  ContentRow,
  DateComponent,
  Heading,
  ScrollContainer,
  StatusMessage,
} from '../../../../../UI';
import { ComponentProps, ComponentType } from 'react';
import { InfoCard } from '@backstage/core-components';
import { App } from '@giantswarm/backstage-plugin-kubernetes-react';
import { getStatus } from '../../../../utils/getStatus';
import { WorkloadReplicaStatus } from '../../../../../hooks/useMimirWorkloadStatus';
import { WorkloadStatusSummary } from '../WorkloadStatusSummary';

const IconWrapper = styled('div')(({ color }) => ({
  display: 'flex',
  marginRight: 10,
  color,
})) as ComponentType<ComponentProps<'div'>>;

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
    <Box>
      <Box>
        <Box display="flex" alignItems="center">
          <IconWrapper color={iconColor}>
            <Icon />
          </IconWrapper>
          <Heading level="h3">{label}</Heading>
        </Box>
        <Typography variant="body2" color="textPrimary">
          {lastTransitionTime ? (
            <DateComponent value={lastTransitionTime} relative />
          ) : null}
        </Typography>
      </Box>
      {children ? <Box>{children}</Box> : null}
    </Box>
  );
};

type AppStatusProps = {
  app: App;
  workloads?: WorkloadReplicaStatus[];
  workloadsLoading?: boolean;
  workloadsEnabled?: boolean;
  workloadsError?: Error | null;
  workloadsLabelSelector?: string;
};

export const AppStatus = ({
  app,
  workloads,
  workloadsLoading = false,
  workloadsEnabled = true,
  workloadsError = null,
  workloadsLabelSelector,
}: AppStatusProps) => {
  const status = getStatus(app);
  if (!status) {
    return (
      <Paper>
        <Box padding={2}>
          <Heading level="h3">No status information available</Heading>
        </Box>
      </Paper>
    );
  }

  const lastTransitionTime = app.getStatus()!.release.lastDeployed;
  const reason = app.getStatus()!.release.reason;

  return (
    <InfoCard title="Status">
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
      <Box mt={2}>
        <WorkloadStatusSummary
          workloads={workloads ?? []}
          workloadsLoading={workloadsLoading}
          workloadsEnabled={workloadsEnabled}
          workloadsError={workloadsError}
          workloadsLabelSelector={workloadsLabelSelector}
        />
      </Box>
    </InfoCard>
  );
};
