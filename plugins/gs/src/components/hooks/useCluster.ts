import {
  getClusterGVK,
  getClusterNames,
  type Cluster,
} from '@giantswarm/backstage-plugin-gs-common';
import { useGetResource } from './useGetResource';
import { useApiVersionOverride } from './useApiVersionOverrides';

export function useCluster(
  installationName: string,
  name: string,
  namespace?: string,
) {
  const apiVersion = useApiVersionOverride(installationName, getClusterNames());
  const gvk = getClusterGVK(apiVersion);

  return useGetResource<Cluster>(installationName, gvk, name, namespace);
}
