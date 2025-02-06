import {
  getClusterInfrastructureRef,
  getProviderClusterGVK,
  getProviderClusterNames,
  type Cluster,
  type ProviderCluster,
} from '@giantswarm/backstage-plugin-gs-common';
import { useGetResource } from './useGetResource';
import { useApiVersionOverride } from './useApiVersionOverrides';

export function useProviderCluster(installationName: string, cluster: Cluster) {
  const { kind, apiVersion, name, namespace } =
    getClusterInfrastructureRef(cluster);

  const apiVersionOverride = useApiVersionOverride(
    installationName,
    getProviderClusterNames(kind),
  );
  const gvk = getProviderClusterGVK(kind, apiVersionOverride ?? apiVersion);

  return {
    ...useGetResource<ProviderCluster>(
      { installationName, gvk, name, namespace },
      { enabled: true },
    ),
    queryErrorMessage: 'Failed to fetch provider cluster',
  };
}
