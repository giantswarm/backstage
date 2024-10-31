import React from 'react';
import { Box, Grid, Typography } from '@material-ui/core';

import {
  Cluster,
  getClusterK8sAPIUrl,
} from '@giantswarm/backstage-plugin-gs-common';
import { CodeBlock, NotAvailable } from '../../../../../UI';

type ClusterAccessProps = {
  cluster: Cluster;
};

export const ClusterAccessCustomer = ({ cluster }: ClusterAccessProps) => {
  const k8sAPIUrl = getClusterK8sAPIUrl(cluster);

  return (
    <Grid container direction="column">
      <Grid item>
        <Box>
          <Typography variant="body2">API endpoint:</Typography>
          <Box marginTop={1}>
            {k8sAPIUrl ? (
              <CodeBlock text={k8sAPIUrl} language="bash" />
            ) : (
              <NotAvailable />
            )}
          </Box>
        </Box>
      </Grid>
    </Grid>
  );
};
