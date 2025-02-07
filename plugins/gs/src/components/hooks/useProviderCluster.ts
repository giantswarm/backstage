import {
  getClusterInfrastructureRef,
  getProviderClusterGVK,
  getProviderClusterNames,
  type Cluster,
  type ProviderCluster,
} from '@giantswarm/backstage-plugin-gs-common';
import { useGetResource } from './useGetResource';
import { useApiVersionOverride } from './useApiVersionOverrides';
import { getErrorMessage } from './utils/helpers';

export function useProviderCluster(installationName: string, cluster: Cluster) {
  const { kind, apiVersion, name, namespace } =
    getClusterInfrastructureRef(cluster);

  const apiVersionOverride = useApiVersionOverride(
    installationName,
    getProviderClusterNames(kind),
  );
  const gvk = getProviderClusterGVK(kind, apiVersionOverride ?? apiVersion);

  const query = useGetResource<ProviderCluster>(
    { installationName, gvk, name, namespace },
    { enabled: true },
  );

  return {
    ...query,
    queryErrorMessage: getErrorMessage({
      error: query.error,
      resourceKind: 'provider cluster',
      resourceName: name,
      resourceNamespace: namespace,
    }),
  };
}
