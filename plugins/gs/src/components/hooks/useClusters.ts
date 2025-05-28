import {
  getClusterGVK,
  getClusterNames,
  type Cluster,
  type List,
  type Organization,
  type Resource,
} from '@giantswarm/backstage-plugin-gs-common';
import { useOrganizations } from './useOrganizations';
import { useInstallations } from './useInstallations';
import { useApi } from '@backstage/core-plugin-api';
import { useQueries } from '@tanstack/react-query';
import { getK8sListPath } from './utils/k8sPath';
import { getInstallationsQueriesInfo } from './utils/queries';
import { useApiVersionOverrides } from './useApiVersionOverrides';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useMemo } from 'react';

function getInstallationOrganizationNamespaces(
  installationName: string,
  organizations: Resource<Organization>[],
) {
  const namespaces = organizations
    .filter(org => org.installationName === installationName)
    .map(org => org.status?.namespace);

  return namespaces.filter((namespace): namespace is string =>
    Boolean(namespace),
  );
}

export function useClusters(installations?: string[]) {
  const { activeInstallations } = useInstallations();
  const selectedInstallations = installations ?? activeInstallations;

  const apiVersionOverrides = useApiVersionOverrides(selectedInstallations);

  const installationsGVKs = Object.fromEntries(
    selectedInstallations.map(installationName => {
      const apiVersion =
        apiVersionOverrides[installationName]?.[getClusterNames().plural];
      const gvk = getClusterGVK(apiVersion);

      return [installationName, gvk];
    }),
  );

  const {
    resources: organizations,
    errors: organizationsErrors,
    isLoading: isLoadingOrganizations,
  } = useOrganizations(selectedInstallations);

  const kubernetesApi = useApi(kubernetesApiRef);

  const queriesInfo = useQueries({
    queries: selectedInstallations.map(installationName => {
      const namespaces = getInstallationOrganizationNamespaces(
        installationName,
        organizations,
      );

      const gvk = installationsGVKs[installationName];

      return {
        queryKey: [installationName, 'clusters', namespaces.join()],
        queryFn: async () => {
          const requests = namespaces.map(namespace => {
            return kubernetesApi.proxy({
              clusterName: installationName,
              path: getK8sListPath(gvk, namespace),
            });
          });

          const responses = await Promise.all(requests);

          const lists: List<Cluster>[] = await Promise.all(
            responses.map(response => response.json()),
          );

          return lists.flatMap(list => list.items);
        },
        enabled: !isLoadingOrganizations,
      };
    }),
    combine: results =>
      getInstallationsQueriesInfo(selectedInstallations, results),
  });

  const resources: Resource<Cluster>[] = useMemo(() => {
    return queriesInfo.installationsData.flatMap(({ installationName, data }) =>
      data.map(resource => ({ installationName, ...resource })),
    );
  }, [queriesInfo.installationsData]);

  const errors = useMemo(() => {
    return [...organizationsErrors, ...queriesInfo.errors];
  }, [organizationsErrors, queriesInfo.errors]);

  return {
    ...queriesInfo,
    resources,
    isLoading: queriesInfo.isLoading || isLoadingOrganizations,
    errors,
  };
}
