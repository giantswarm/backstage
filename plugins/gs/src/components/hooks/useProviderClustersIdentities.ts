import { featureFlagsApiRef, useApi } from '@backstage/core-plugin-api';
import { useQueries } from '@tanstack/react-query';
import {
  getProviderClusterIdentityRef,
  getProviderClusterIdentityGVK,
  Resource,
  type ProviderCluster,
  type ProviderClusterIdentity,
  type List,
  type InstallationObjectRef,
  isSupportedProviderClusterIdentity,
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
  const gvk = getProviderClusterIdentityGVK(kind, apiVersion);

  return [installationName, 'get', gvk.plural, namespace, name].filter(
    Boolean,
  ) as string[];
};

const listQueryKey = (ref: Omit<InstallationObjectRef, 'name'>) => {
  const { installationName, kind, apiVersion, namespace } = ref;
  const gvk = getProviderClusterIdentityGVK(kind, apiVersion);

  return [installationName, 'list', gvk.plural, namespace].filter(
    Boolean,
  ) as string[];
};

const getQueryFn = (
  ref: InstallationObjectRef,
  kubernetesApi: KubernetesApi,
) => {
  const { installationName, kind, apiVersion, name, namespace } = ref;
  const gvk = getProviderClusterIdentityGVK(kind, apiVersion);
  const path = getK8sGetPath(gvk, name, namespace);

  return async () => {
    const response = await kubernetesApi.proxy({
      clusterName: installationName,
      path,
    });

    if (!response.ok) {
      const error = new Error(
        `Failed to fetch resources from ${installationName} at ${path}. Reason: ${response.statusText}.`,
      );
      error.name = response.status === 403 ? 'ForbiddenError' : error.name;
      error.name = response.status === 404 ? 'NotFoundError' : error.name;

      throw error;
    }

    const providerCluster: ProviderClusterIdentity = await response.json();

    return providerCluster;
  };
};

const listQueryFn = (
  ref: Omit<InstallationObjectRef, 'name'>,
  kubernetesApi: KubernetesApi,
) => {
  const { installationName, kind, apiVersion, namespace } = ref;
  const gvk = getProviderClusterIdentityGVK(kind, apiVersion);
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
      error.name = response.status === 403 ? 'ForbiddenError' : error.name;
      error.name = response.status === 404 ? 'NotFoundError' : error.name;

      throw error;
    }

    const list: List<ProviderClusterIdentity> = await response.json();

    return list.items;
  };
};

export function useProviderClustersIdentities(
  providerClusterResources: Resource<ProviderCluster>[],
  { enabled = true },
) {
  const featureFlagsApi = useApi(featureFlagsApiRef);
  const kubernetesApi = useApi(kubernetesApiRef);

  const isExperimentalDataFetchingEnabled = featureFlagsApi.isActive(
    'experimental-data-fetching',
  );

  const identityRefs = providerClusterResources
    .map(({ installationName, ...providerCluster }) => {
      const identityRef = getProviderClusterIdentityRef(providerCluster);
      return identityRef && isSupportedProviderClusterIdentity(identityRef.kind)
        ? { installationName, ...identityRef }
        : undefined;
    })
    .filter(Boolean) as InstallationObjectRef[];
  const refs = isExperimentalDataFetchingEnabled
    ? identityRefs
    : getUniqueRefsByNamespace(identityRefs);

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
    .filter(Boolean) as Resource<ProviderClusterIdentity>[];

  return {
    ...queriesInfo,
    resources,
  };
}
