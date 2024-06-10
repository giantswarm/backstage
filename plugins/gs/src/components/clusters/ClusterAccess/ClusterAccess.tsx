import React from 'react';
import { Card, CardContent, Grid } from '@material-ui/core';
import { Cluster, getClusterName } from '@internal/plugin-gs-common';
import { StructuredMetadataList } from '../../UI';
import { toSentenceCase } from '../../utils/helpers';
import { calculateClusterType } from '../utils';

type ClusterAccessProps = {
  cluster: Cluster;
  installationName: string;
};

export const ClusterAccess = ({
  cluster,
  installationName,
}: ClusterAccessProps) => {
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
                  Cluster: getClusterName(cluster),
                  Type: toSentenceCase(clusterType),
                }}
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </div>
  );
};
