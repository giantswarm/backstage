import React from 'react';
import { EmptyState, Progress, WarningPanel } from '@backstage/core-components';
import { CustomResourceMatcher } from '@backstage/plugin-kubernetes-common';
import { Cluster } from '@internal/plugin-gs-common';
import { useCluster } from '../../hooks';

type ClusterWrapperProps = {
  installationName: string;
  gvk: CustomResourceMatcher;
  namespace: string;
  name: string;
  render(cluster: Cluster): React.JSX.Element;
};

export const ClusterWrapper = ({
  installationName,
  gvk,
  namespace,
  name,
  render,
}: ClusterWrapperProps) => {
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

  return render(cluster);
};
