import { featureFlagsApiRef, useApi } from '@backstage/core-plugin-api';
import { useQueries } from '@tanstack/react-query';
import {
  getClusterInfrastructureRef,
  getProviderClusterGVK,
  type List,
  type Resource,
  type Cluster,
  type ProviderCluster,
  InstallationObjectRef,
} from '@giantswarm/backstage-plugin-gs-common';
import { gsKubernetesApiRef, KubernetesApi } from '../../apis/kubernetes';
import { getK8sGetPath, getK8sListPath } from './utils/k8sPath';
import { getInstallationsQueriesInfo } from './utils/queries';
import { getUniqueRefsByNamespace } from './utils/helpers';

const getQueryKey = (ref: InstallationObjectRef) => {
  const { installationName, kind, apiVersion, name, namespace } = ref;
  const gvk = getProviderClusterGVK(kind, apiVersion);

  return [installationName, 'get', gvk.plural, namespace, name].filter(
    Boolean,
  ) as string[];
};

const listQueryKey = (ref: Omit<InstallationObjectRef, 'name'>) => {
  const { installationName, kind, apiVersion, namespace } = ref;
  const gvk = getProviderClusterGVK(kind, apiVersion);

  return [installationName, 'list', gvk.plural, namespace].filter(
    Boolean,
  ) as string[];
};

const getQueryFn = (
  ref: InstallationObjectRef,
  kubernetesApi: KubernetesApi,
) => {
  const { installationName, kind, apiVersion, name, namespace } = ref;
  const gvk = getProviderClusterGVK(kind, apiVersion);
  const path = getK8sGetPath(gvk, name, namespace);

  return async () => {
    const response = await kubernetesApi.proxy({
      clusterName: installationName,
      path,
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }

      const error = new Error(
        `Failed to fetch resources from ${installationName} at ${path}. Reason: ${response.statusText}.`,
      );

      throw error;
    }

    const providerCluster: ProviderCluster = await response.json();

    return providerCluster;
  };
};

const listQueryFn = (
  ref: Omit<InstallationObjectRef, 'name'>,
  kubernetesApi: KubernetesApi,
) => {
  const { installationName, kind, apiVersion, namespace } = ref;
  const gvk = getProviderClusterGVK(kind, apiVersion);
  const path = getK8sListPath(gvk, namespace);

  return async () => {
    const response = await kubernetesApi.proxy({
      clusterName: installationName,
      path,
    });

    if (!response.ok) {
      const error = new Error(
        `Failed to fetch resources from ${installationName} at ${path}. Reason: ${response.statusText}.`,
      );

      throw error;
    }

    const list: List<ProviderCluster> = await response.json();

    return list.items;
  };
};

export function useProviderClusters(
  clusterResources: Resource<Cluster>[],
  { enabled = true },
) {
  const featureFlagsApi = useApi(featureFlagsApiRef);
  const kubernetesApi = useApi(gsKubernetesApiRef);

  const isExperimentalDataFetchingEnabled = featureFlagsApi.isActive(
    'experimental-data-fetching',
  );

  const infrastructureRefs = clusterResources
    .map(({ installationName, ...cluster }) => {
      const infrastructureRef = getClusterInfrastructureRef(cluster);
      return infrastructureRef
        ? { installationName, ...infrastructureRef }
        : undefined;
    })
    .filter(Boolean) as InstallationObjectRef[];

  const refs = isExperimentalDataFetchingEnabled
    ? infrastructureRefs
    : getUniqueRefsByNamespace(infrastructureRefs);

  const queries = useQueries({
    queries: refs.map(ref => {
      const queryKey = isExperimentalDataFetchingEnabled
        ? getQueryKey(ref as InstallationObjectRef)
        : listQueryKey(ref);
      const queryFn = isExperimentalDataFetchingEnabled
        ? getQueryFn(ref as InstallationObjectRef, kubernetesApi)
        : listQueryFn(ref, kubernetesApi);

      return {
        queryKey,
        queryFn,
        enabled,
      };
    }),
  });

  const installations = refs.map(({ installationName }) => installationName);
  const queriesInfo = getInstallationsQueriesInfo(installations, queries);

  const resources = queriesInfo.installationsData
    .flatMap(({ installationName, data }) => {
      if (data === null) {
        return null;
      }

      return Array.isArray(data)
        ? data.map(resource => ({ installationName, ...resource }))
        : {
            installationName,
            ...data,
          };
    })
    .filter(Boolean) as Resource<ProviderCluster>[];

  return {
    ...queriesInfo,
    resources,
  };
}
