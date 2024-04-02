import React from 'react';
import { Box, Paper } from '@material-ui/core';
import type { HelmRelease } from '@internal/plugin-gs-common';
import { getHelmReleaseStatus } from '@internal/plugin-gs-common';
import { useHelmReleaseStatusDetails } from '../../hooks';
import { DeploymentStatusCard } from '../../UI/DeploymentStatusCard';
import { Heading } from '../../UI/Heading';
import { HelmReleaseDetailsConditions } from '../HelmReleaseDetailsConditions';
import { compareDates } from '../../utils/helpers';

const StatusCard = ({
  status,
  lastTransitionTime,
  children,
}: {
  status: string;
  lastTransitionTime?: string;
  children?: React.ReactNode;
}) => {
  const {
    icon: Icon,
    color: iconColor,
    label,
  } = useHelmReleaseStatusDetails(status);

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

type HelmReleaseDetailsStatusProps = {
  helmrelease: HelmRelease;
};

export const HelmReleaseDetailsStatus = ({
  helmrelease,
}: HelmReleaseDetailsStatusProps) => {
  const status = getHelmReleaseStatus(helmrelease);
  if (!status) {
    return (
      <Paper>
        <Box padding={2}>
          <Heading>No status information available</Heading>
        </Box>
      </Paper>
    );
  }

  const conditions = helmrelease.status!.conditions!.sort((a, b) =>
    compareDates(b.lastTransitionTime, a.lastTransitionTime),
  );
  const lastTransitionTime =
    conditions.length > 0 ? conditions[0].lastTransitionTime : undefined;

  return (
    <StatusCard status={status} lastTransitionTime={lastTransitionTime}>
      <HelmReleaseDetailsConditions conditions={conditions} />
    </StatusCard>
  );
};
