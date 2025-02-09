import { featureFlagsApiRef, useApi } from '@backstage/core-plugin-api';
import { useQueries } from '@tanstack/react-query';
import {
  type List,
  type Resource,
  type Cluster,
  type ControlPlane,
  type InstallationObjectRef,
  getClusterControlPlaneRef,
  getResourceGVK,
} from '@giantswarm/backstage-plugin-gs-common';
import { getK8sGetPath, getK8sListPath } from './utils/k8sPath';
import { getInstallationsQueriesInfo } from './utils/queries';
import { getUniqueRefsByNamespace } from './utils/helpers';
import {
  KubernetesApi,
  kubernetesApiRef,
} from '@backstage/plugin-kubernetes-react';

const getQueryKey = (ref: InstallationObjectRef) => {
  const { installationName, kind, apiVersion, name, namespace } = ref;
  const gvk = getResourceGVK(kind, apiVersion);

  return [installationName, 'get', gvk.plural, namespace, name].filter(
    Boolean,
  ) as string[];
};

const listQueryKey = (ref: Omit<InstallationObjectRef, 'name'>) => {
  const { installationName, kind, apiVersion, namespace } = ref;
  const gvk = getResourceGVK(kind, apiVersion);

  return [installationName, 'list', gvk.plural, namespace].filter(
    Boolean,
  ) as string[];
};

const getQueryFn = (
  ref: InstallationObjectRef,
  kubernetesApi: KubernetesApi,
) => {
  const { installationName, kind, apiVersion, name, namespace } = ref;
  const gvk = getResourceGVK(kind, apiVersion);
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

    const controlPlane: ControlPlane = await response.json();

    return controlPlane;
  };
};

const listQueryFn = (
  ref: Omit<InstallationObjectRef, 'name'>,
  kubernetesApi: KubernetesApi,
) => {
  const { installationName, kind, apiVersion, namespace } = ref;
  const gvk = getResourceGVK(kind, apiVersion);
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

    const list: List<ControlPlane> = await response.json();

    return list.items;
  };
};

export function useControlPlanes(
  clusterResources: Resource<Cluster>[],
  { enabled = true },
) {
  const featureFlagsApi = useApi(featureFlagsApiRef);
  const kubernetesApi = useApi(kubernetesApiRef);

  const isExperimentalDataFetchingEnabled = featureFlagsApi.isActive(
    'experimental-data-fetching',
  );

  const controlPlaneRefs = clusterResources
    .map(({ installationName, ...cluster }) => {
      const controlPlaneRef = getClusterControlPlaneRef(cluster);

      return controlPlaneRef
        ? { installationName, ...controlPlaneRef }
        : undefined;
    })
    .filter(Boolean) as InstallationObjectRef[];

  const refs = isExperimentalDataFetchingEnabled
    ? controlPlaneRefs
    : getUniqueRefsByNamespace(controlPlaneRefs);

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
    .filter(Boolean) as Resource<ControlPlane>[];

  return {
    ...queriesInfo,
    resources,
  };
}
