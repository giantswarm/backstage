import { Box } from '@material-ui/core';
import { useFluxDeployments } from '../../../hooks/useFluxDeployments';
import { DeploymentStatusRow } from './DeploymentStatusRow';
import { useMemo } from 'react';
import {
  formatVersion,
  NotAvailable,
} from '@giantswarm/backstage-plugin-ui-react';

type ResourceStatusProps = {
  cluster: string;
};

export const DeploymentStatus = ({ cluster }: ResourceStatusProps) => {
  const { resources: deployments } = useFluxDeployments(cluster);

  const version = useMemo(() => {
    return deployments
      .find(
        deployment =>
          deployment
            .findLabel('app.kubernetes.io/component')
            ?.match('.+-controller$') &&
          Boolean(deployment.findLabel('app.kubernetes.io/version')),
      )
      ?.findLabel('app.kubernetes.io/version');
  }, [deployments]);

  const stats = useMemo(() => {
    const failing = deployments.filter(deployment => !deployment.isAvailable());

    return {
      running: deployments.length - failing.length,
      total: deployments.length,
      failing: failing.map(deployment => ({
        name: deployment.getName(),
        readyReplicas: deployment.getReadyReplicas() ?? 0,
        replicas: deployment.getReplicas() ?? 0,
      })),
    };
  }, [deployments]);

  return (
    <Box mb={2}>
      <DeploymentStatusRow label="Flux version">
        {version ? formatVersion(version) : <NotAvailable />}
      </DeploymentStatusRow>
      <DeploymentStatusRow label="Controller status">
        {stats.running} out of {stats.total} running
      </DeploymentStatusRow>

      {stats.failing.length > 0 &&
        stats.failing.map(deployment => (
          <DeploymentStatusRow label={deployment.name}>
            {deployment.readyReplicas} of {deployment.replicas} replicas
            available
          </DeploymentStatusRow>
        ))}
    </Box>
  );
};
