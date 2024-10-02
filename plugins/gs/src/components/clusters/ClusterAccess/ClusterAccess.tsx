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
import {
  Cluster,
  getClusterName,
} from '@giantswarm/backstage-plugin-gs-common';
import { Heading, StructuredMetadataList } from '../../UI';
import { toSentenceCase } from '../../utils/helpers';
import { calculateClusterType } from '../utils';
import {
  TSH_INSTALLATION_DOCS_URL,
  TSH_LOGIN_COMMAND,
  getControlPlaneNodeAccessCommand,
  getKubernetesAPIAccessCommand,
  getNodeResourcesURL,
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
                For terminal access, first{' '}
                <Link
                  href={TSH_INSTALLATION_DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  install tsh
                </Link>
                . Then run this command:
              </Typography>
              <CodeBlock text={TSH_LOGIN_COMMAND} language="bash" />
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
              subheader="Selecting a node to connect to can be done via tags or using the node name."
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
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </div>
  );
};
