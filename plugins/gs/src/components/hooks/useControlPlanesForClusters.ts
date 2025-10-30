import {
  Cluster,
  ControlPlane,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';

export function useControlPlanesForClusters(
  clusterResources: Cluster[],
  { enabled = true },
) {
  const installations = new Set<string>();
  clusterResources.forEach(cluster => installations.add(cluster.cluster));

  return useResources(Array.from(installations), ControlPlane, {}, { enabled });
}
