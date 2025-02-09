import {
  getResourceRequestGVK,
  getResourceRequestNames,
  Resource,
  type ResourceRequest,
} from '@giantswarm/backstage-plugin-gs-common';
import { useApi } from '@backstage/core-plugin-api';
import { useQueries } from '@tanstack/react-query';
import { getK8sGetPath } from './utils/k8sPath';
import { getInstallationsQueriesInfo } from './utils/queries';
import { useApiVersionOverrides } from './useApiVersionOverrides';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';

export function useResourceRequests(
  kratixResources: {
    installationName: string;
    kind: string;
    name: string;
    namespace: string;
  }[],
) {
  const apiVersionOverrides = useApiVersionOverrides(
    kratixResources.map(item => item.installationName),
  );
  const kubernetesApi = useApi(kubernetesApiRef);
  const queries = useQueries({
    queries: kratixResources.map(
      ({ kind, name, namespace, installationName }) => {
        const resourceNames = getResourceRequestNames(kind);
        const apiVersion =
          apiVersionOverrides[installationName]?.[resourceNames.plural];

        const gvk = getResourceRequestGVK(kind, apiVersion);

        const path = getK8sGetPath(gvk, name, namespace);
        return {
          queryKey: [installationName, gvk!.plural],
          queryFn: async () => {
            const response = await kubernetesApi.proxy({
              clusterName: installationName,
              path,
            });

            if (!response.ok) {
              const error = new Error(
                `Failed to fetch resources from ${installationName} at ${path}. Reason: ${response.statusText}.`,
              );
              error.name =
                response.status === 403 ? 'ForbiddenError' : error.name;
              error.name =
                response.status === 404 ? 'NotFoundError' : error.name;

              throw error;
            }

            const resourceRequest: ResourceRequest = await response.json();

            return resourceRequest;
          },
        };
      },
    ),
  });

  const queriesInfo = getInstallationsQueriesInfo(
    kratixResources.map(item => item.installationName),
    queries,
  );

  const resources: Resource<ResourceRequest>[] =
    queriesInfo.installationsData.map(({ installationName, data }) => ({
      installationName,
      ...data,
    }));

  return {
    ...queriesInfo,
    resources,
    isLoading: queriesInfo.isLoading,
  };
}
