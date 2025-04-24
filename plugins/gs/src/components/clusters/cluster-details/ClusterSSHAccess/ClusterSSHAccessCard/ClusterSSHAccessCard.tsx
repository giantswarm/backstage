import { InfoCard } from '@backstage/core-components';
import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { Box, Grid, Link, Typography } from '@material-ui/core';
import { CodeBlock, Heading } from '../../../../UI';
import {
  getControlPlaneNodeAccessCommand,
  getNodeResourcesURL,
  getSpecificNodeAccessCommandExample,
  getWorkerNodeAccessCommand,
} from './utils';
import { getClusterName } from '@giantswarm/backstage-plugin-gs-common';

export function ClusterSSHAccessCard() {
  const { cluster, installationName } = useCurrentCluster();
  const clusterName = getClusterName(cluster);

  return (
    <InfoCard title="SSH access">
      <Grid container direction="column">
        <Grid item>
          <Box marginBottom={2}>
            <Typography variant="body2">
              Selecting a node to connect to can be done via tags or using the
              node name.
            </Typography>
          </Box>

          <Box marginTop={1}>
            <Heading level="h4">Control plane nodes</Heading>
            <Box marginTop={1}>
              <CodeBlock
                text={getControlPlaneNodeAccessCommand(
                  clusterName,
                  installationName,
                )}
                language="bash"
              />
            </Box>
          </Box>

          <Box marginTop={1}>
            <Heading level="h4">Worker nodes</Heading>
            <Box marginTop={1}>
              <CodeBlock
                text={getWorkerNodeAccessCommand(clusterName, installationName)}
                language="bash"
              />
            </Box>
          </Box>

          <Box marginTop={1}>
            <Heading level="h4">Specific node</Heading>
            <Typography variant="body2">
              This requires you to specify the hostname as the node tag value.
              Example:
            </Typography>
            <Box marginTop={1}>
              <CodeBlock
                text={getSpecificNodeAccessCommandExample(installationName)}
                language="bash"
              />
            </Box>
            <Typography variant="body2">
              Find all nodes via the{' '}
              <Link
                href={getNodeResourcesURL(clusterName, installationName)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Teleport resources UI
              </Link>
              .
            </Typography>
          </Box>
        </Grid>
      </Grid>
    </InfoCard>
  );
}
