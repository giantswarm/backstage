import React from 'react';
import { EmptyState, Progress, WarningPanel } from '@backstage/core-components';
import { Cluster } from '@giantswarm/backstage-plugin-gs-common';
import { useCluster } from '../../hooks';

type ClusterWrapperProps = {
  installationName: string;
  namespace: string;
  name: string;
  render(cluster: Cluster): React.JSX.Element;
};

export const ClusterWrapper = ({
  installationName,
  namespace,
  name,
  render,
}: ClusterWrapperProps) => {
  const {
    data: cluster,
    isLoading,
    error,
  } = useCluster(installationName, name, namespace);

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

  return render(cluster);
};
