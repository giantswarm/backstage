import React from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Grid,
  Link,
  Typography,
} from '@material-ui/core';
import { Cluster, getClusterName } from '@internal/plugin-gs-common';
import { Heading, StructuredMetadataList } from '../../UI';
import { toSentenceCase } from '../../utils/helpers';
import { calculateClusterType } from '../utils';
import {
  getControlPlaneNodeAccessCommand,
  getKubernetesAPIAccessCommand,
  getSpecificNodeAccessCommandExample,
  getWorkerNodeAccessCommand,
} from './utils';
import { CodeBlock } from '../../UI/CodeBlock';

type ClusterAccessProps = {
  cluster: Cluster;
  installationName: string;
};

export const ClusterAccess = ({
  cluster,
  installationName,
}: ClusterAccessProps) => {
  const clusterName = getClusterName(cluster);
  const clusterType = calculateClusterType(cluster, installationName);

  return (
    <div>
      <Grid container direction="column">
        <Grid item>
          <Card>
            <CardContent>
              <StructuredMetadataList
                metadata={{
                  Installation: installationName,
                  Cluster: clusterName,
                  Type: toSentenceCase(clusterType),
                }}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item>
          <Card>
            <CardHeader
              title={<Heading level="h3">Teleport prerequisites</Heading>}
              titleTypographyProps={{ variant: undefined }}
            />
            <CardContent>
              <Typography variant="body2">
                For terminal access, first <Link>install tsh</Link>. Then run
                this command:
              </Typography>
              <CodeBlock
                text="tsh login --proxy=teleport.giantswarm.io:443 teleport.giantswarm.io"
                language="bash"
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item>
          <Card>
            <CardHeader
              title={<Heading level="h3">Kubernetes API access</Heading>}
              titleTypographyProps={{ variant: undefined }}
            />
            <CardContent>
              <Typography variant="body2">
                This command will set up your kubectl context:
              </Typography>
              <CodeBlock
                text={getKubernetesAPIAccessCommand(
                  clusterName,
                  installationName,
                )}
                language="bash"
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item>
          <Card>
            <CardHeader
              title={<Heading level="h3">SSH access</Heading>}
              titleTypographyProps={{ variant: undefined }}
              subheader="Selecting a node to connect to can be done via tags or using the node name. You can choose between your local terminal or via the Teleport web console."
              subheaderTypographyProps={{ variant: 'body2', color: 'inherit' }}
            />
            <CardContent>
              <Box>
                <Heading level="h4">Control plane nodes</Heading>
                <CodeBlock
                  text={getControlPlaneNodeAccessCommand(
                    clusterName,
                    installationName,
                  )}
                  language="bash"
                />
              </Box>

              <Box marginTop={2}>
                <Heading level="h4">Worker nodes</Heading>
                <CodeBlock
                  text={getWorkerNodeAccessCommand(
                    clusterName,
                    installationName,
                  )}
                  language="bash"
                />
              </Box>

              <Box marginTop={2}>
                <Heading level="h4">Specific node</Heading>
                <Typography variant="body2">
                  This requires you to specify the hostname as the node tag
                  value. Example:
                </Typography>
                <CodeBlock
                  text={getSpecificNodeAccessCommandExample(installationName)}
                  language="bash"
                />
                <Typography variant="body2">
                  Find all nodes via the <Link>Teleport resources UI</Link>.
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </div>
  );
};
