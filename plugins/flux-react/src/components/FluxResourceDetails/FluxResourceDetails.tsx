import { useMemo } from 'react';
import { Details } from '../FluxOverview/Details';
import { KustomizationTreeBuilder } from '../FluxOverview/utils/KustomizationTreeBuilder';
import {
  FluxResourceCollections,
  filterFluxResourcesByCluster,
  findFluxResource,
} from '../../utils/fluxResources';

export const FluxResourceDetails = ({
  cluster,
  kind,
  name,
  namespace,
  resources,
  isLoading,
}: {
  cluster: string;
  kind: string;
  name: string;
  namespace: string;
  resources: FluxResourceCollections;
  isLoading: boolean;
}) => {
  const resourceRef = useMemo(
    () => ({ cluster, kind, name, namespace }),
    [cluster, kind, name, namespace],
  );

  const selectedResource = useMemo(
    () => findFluxResource(resources, resourceRef),
    [resources, resourceRef],
  );

  const treeBuilder = useMemo(
    () =>
      new KustomizationTreeBuilder(
        filterFluxResourcesByCluster(resources, cluster),
      ),
    [cluster, resources],
  );

  return (
    <Details
      resourceRef={resourceRef}
      resource={selectedResource}
      treeBuilder={treeBuilder}
      resources={resources}
      isLoadingResources={isLoading}
    />
  );
};
