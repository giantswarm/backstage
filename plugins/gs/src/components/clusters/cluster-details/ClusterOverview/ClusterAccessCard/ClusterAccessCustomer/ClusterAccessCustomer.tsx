import { Box, Grid, Typography } from '@material-ui/core';
import { CodeBlock, NotAvailable } from '../../../../../UI';
import { Cluster } from '@giantswarm/backstage-plugin-kubernetes-react';
import { getClusterK8sAPIUrl } from '../../../../utils';

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
