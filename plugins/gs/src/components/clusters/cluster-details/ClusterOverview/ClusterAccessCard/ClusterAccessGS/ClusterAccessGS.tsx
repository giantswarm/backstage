import React from 'react';
import { Box, Grid, Link, Typography } from '@material-ui/core';

import {
  Cluster,
  getClusterName,
} from '@giantswarm/backstage-plugin-gs-common';
import {
  TSH_INSTALLATION_DOCS_URL,
  TSH_LOGIN_COMMAND,
  getKubernetesAPIAccessCommand,
} from './utils';
import { CodeBlock, SimpleAccordion } from '../../../../../UI';

type ClusterAccessProps = {
  cluster: Cluster;
  installationName: string;
};

export const ClusterAccessGS = ({
  cluster,
  installationName,
}: ClusterAccessProps) => {
  const clusterName = getClusterName(cluster);

  return (
    <Grid container direction="column">
      <Grid item>
        <Box marginBottom={1}>
          <Typography variant="body2">
            This command will set up your kubectl context:
          </Typography>
          <Box marginTop={1}>
            <CodeBlock
              text={getKubernetesAPIAccessCommand(
                clusterName,
                installationName,
              )}
              language="bash"
            />
          </Box>
        </Box>

        <SimpleAccordion title="How to set up tsh">
          <Box width="100%">
            <Typography variant="body2">
              First{' '}
              <Link
                href={TSH_INSTALLATION_DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                install tsh
              </Link>
              . Then run this command once:
            </Typography>
            <Box marginTop={1}>
              <CodeBlock text={TSH_LOGIN_COMMAND} language="bash" />
            </Box>
          </Box>
        </SimpleAccordion>
      </Grid>
    </Grid>
  );
};
