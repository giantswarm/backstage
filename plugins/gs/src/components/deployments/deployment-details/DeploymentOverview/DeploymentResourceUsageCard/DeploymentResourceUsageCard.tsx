import { InfoCard } from '@backstage/core-components';
import { Box, LinearProgress, Typography, makeStyles } from '@material-ui/core';
import Alert from '@material-ui/lab/Alert';
import {
  App,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { useCurrentDeployment } from '../../../DeploymentDetailsPage/useCurrentDeployment';
import { findTargetClusterName } from '../../../utils/findTargetCluster';
import { useMimirResourceUsage } from '../../../../hooks/useMimirResourceUsage';

/**
 * Derives the namespace where the workload pods actually run.
 * - For HelmRelease CRs: `spec.targetNamespace` (falls back to the CR namespace).
 * - For App CRs: `spec.namespace` is the target deployment namespace.
 */
function getWorkloadNamespace(deployment: App | HelmRelease): string {
  if (deployment instanceof HelmRelease) {
    return deployment.getTargetNamespace() ?? deployment.getNamespace() ?? '';
  }
  return deployment.getSpec()?.namespace ?? deployment.getNamespace() ?? '';
}

/**
 * Derives the pod name prefix for the workload.
 * - For HelmRelease CRs: `spec.releaseName` (falls back to the CR name).
 * - For App CRs: the CR name.
 */
function getWorkloadPodPrefix(deployment: App | HelmRelease): string {
  if (deployment instanceof HelmRelease) {
    return deployment.getReleaseName() ?? deployment.getName();
  }
  return deployment.getName();
}

const useStyles = makeStyles(theme => ({
  metricRow: {
    marginBottom: theme.spacing(2),
    '&:last-child': {
      marginBottom: 0,
    },
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
  },
  progressLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: theme.spacing(0.5),
  },
  cpuBarColor: {
    backgroundColor: '#5c99ed',
  },
  memoryBarColor: {
    backgroundColor: '#b57cd6',
  },
}));

function formatCpu(cores: number | undefined): string {
  if (cores === undefined) return 'N/A';
  if (cores < 1) return `${Math.round(cores * 1000)}m`;
  return `${cores.toFixed(2)}`;
}

function formatMemory(bytes: number | undefined): string {
  if (bytes === undefined) return 'N/A';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function usagePercent(
  used: number | undefined,
  requested: number | undefined,
): number | undefined {
  if (used === undefined || requested === undefined || requested === 0)
    return undefined;
  return (used / requested) * 100;
}

function MetricRow(props: {
  label: string;
  usedLabel: string;
  requestedLabel: string;
  limitLabel?: string;
  percent: number | undefined;
  isLoading: boolean;
  barColorClassName?: string;
}) {
  const {
    label,
    usedLabel,
    requestedLabel,
    limitLabel,
    percent,
    isLoading,
    barColorClassName,
  } = props;
  const classes = useStyles();

  const barClasses = barColorClassName
    ? { bar: barColorClassName, bar1Determinate: barColorClassName }
    : undefined;

  return (
    <Box className={classes.metricRow}>
      <Typography variant="body2" gutterBottom>
        <strong>{label}</strong>
      </Typography>
      {isLoading ? (
        <LinearProgress className={classes.progressBar} classes={barClasses} />
      ) : (
        <LinearProgress
          variant="determinate"
          value={Math.min(percent ?? 0, 100)}
          className={classes.progressBar}
          classes={barClasses}
        />
      )}
      <Box className={classes.progressLabel}>
        <Typography variant="caption" color="textSecondary">
          Usage {usedLabel} / Request {requestedLabel}
          {limitLabel && ` (Limit: ${limitLabel})`}
        </Typography>
        {percent !== undefined && (
          <Typography variant="caption" color="textSecondary">
            {percent.toFixed(1)}%
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export function DeploymentResourceUsageCard() {
  const classes = useStyles();
  const { deployment, installationName } = useCurrentDeployment();

  const clusterName = findTargetClusterName(deployment);
  const namespace = getWorkloadNamespace(deployment);
  const deploymentName = getWorkloadPodPrefix(deployment);

  const {
    cpuUsage,
    cpuRequests,
    cpuLimits,
    memoryUsage,
    memoryRequests,
    memoryLimits,
    isLoading,
    error,
  } = useMimirResourceUsage({
    installationName,
    clusterName,
    namespace,
    deploymentName,
  });

  if (!clusterName) {
    return null;
  }

  if (error) {
    return (
      <InfoCard title="Resource Usage">
        <Alert severity="warning">Metrics unavailable</Alert>
      </InfoCard>
    );
  }

  const hasNoData =
    !isLoading &&
    cpuUsage === undefined &&
    cpuRequests === undefined &&
    memoryUsage === undefined &&
    memoryRequests === undefined;

  if (hasNoData) {
    return (
      <InfoCard title="Resource Usage">
        <Typography variant="body2" color="textSecondary">
          No metrics data available for this deployment.
        </Typography>
      </InfoCard>
    );
  }

  return (
    <InfoCard title="Resource Usage">
      <MetricRow
        label="CPU"
        usedLabel={formatCpu(cpuUsage)}
        requestedLabel={formatCpu(cpuRequests)}
        limitLabel={cpuLimits !== undefined ? formatCpu(cpuLimits) : undefined}
        percent={usagePercent(cpuUsage, cpuRequests)}
        isLoading={isLoading}
        barColorClassName={classes.cpuBarColor}
      />
      <MetricRow
        label="Memory"
        usedLabel={formatMemory(memoryUsage)}
        requestedLabel={formatMemory(memoryRequests)}
        limitLabel={
          memoryLimits !== undefined ? formatMemory(memoryLimits) : undefined
        }
        percent={usagePercent(memoryUsage, memoryRequests)}
        isLoading={isLoading}
        barColorClassName={classes.memoryBarColor}
      />
    </InfoCard>
  );
}
