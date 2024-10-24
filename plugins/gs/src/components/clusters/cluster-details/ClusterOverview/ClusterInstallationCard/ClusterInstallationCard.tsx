import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Link, InfoCard } from '@backstage/core-components';
import { Box, Grid, Typography } from '@material-ui/core';
import { AboutField } from '@backstage/plugin-catalog';

import { useCurrentCluster } from '../../../ClusterDetailsPage/useCurrentCluster';
import { useRouteRef } from '@backstage/core-plugin-api';
import { clusterDetailsRouteRef } from '../../../../../routes';
import { Constants } from '@giantswarm/backstage-plugin-gs-common';

export function ClusterInstallationCard() {
  const { installationName } = useCurrentCluster();

  const managementClusterRouteLink = useRouteRef(clusterDetailsRouteRef);

  return (
    <InfoCard title="Installation">
      <Box>
        <Typography variant="body2">
          Details about the Giant Swarm installation hosting this cluster.
        </Typography>

        <Box marginTop={2} marginBottom={2}>
          <Grid container spacing={5}>
            <AboutField
              label="Installation name"
              value={installationName}
              gridSizes={{ xs: 6, md: 4 }}
            />
            <AboutField
              label="Provider"
              value="AWS"
              gridSizes={{ xs: 6, md: 4 }}
            />
            <AboutField
              label="Location"
              value="eu-central1"
              gridSizes={{ xs: 6, md: 4 }}
            />
          </Grid>
        </Box>

        <Link
          component={RouterLink}
          to={managementClusterRouteLink({
            installationName: installationName,
            namespace: Constants.MANAGEMENT_CLUSTER_NAMESPACE,
            name: installationName,
          })}
        >
          Open management cluster
        </Link>
      </Box>
    </InfoCard>
  );
}
