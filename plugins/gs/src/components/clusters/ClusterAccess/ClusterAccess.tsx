import React from 'react';
import { EmptyState, Progress, WarningPanel } from '@backstage/core-components';
import { CustomResourceMatcher } from '@backstage/plugin-kubernetes-common';
import { Card, CardContent, Grid } from '@material-ui/core';
import { getClusterName } from '@internal/plugin-gs-common';
import { useCluster } from '../../hooks';
import { StructuredMetadataList } from '../../UI';
import { toSentenceCase } from '../../utils/helpers';
import { calculateClusterType } from '../utils';

type ClusterAccessProps = {
  installationName: string;
  gvk: CustomResourceMatcher;
  namespace: string;
  name: string;
};

export const ClusterAccess = ({
  installationName,
  gvk,
  namespace,
  name,
}: ClusterAccessProps) => {
  const {
    data: cluster,
    isLoading,
    error,
  } = useCluster(installationName, gvk, name, namespace);

  if (isLoading) {
    return <Progress />;
  }

  if (error) {
    return (
      <WarningPanel
        severity="error"
        title={`Could not load ${namespace}/${name} resource.`}
      >
        {(error as Error).message}
      </WarningPanel>
    );
  }

  if (!cluster) {
    return (
      <EmptyState
        missing="info"
        title="No cluster found"
        description={`Cluster ${installationName}:${namespace}/${name} was not found`}
      />
    );
  }

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
