import type {
  Cluster,
  List,
  Organization,
  Resource,
} from '@internal/plugin-gs-common';
import { clusterGVK } from '@internal/plugin-gs-common';
import { useOrganizations } from './useOrganizations';
import { useInstallations } from './useInstallations';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes';
import { useQueries } from '@tanstack/react-query';
import { getK8sListPath } from './utils/k8sPath';
import { getInstallationsQueriesInfo } from './utils/queries';

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
  const { selectedInstallations: savedInstallations } = useInstallations();
  const selectedInstallations = installations ?? savedInstallations;
  const { resources: organizations, initialLoading: isLoadingOrganizations } =
    useOrganizations(selectedInstallations);

  const kubernetesApi = useApi(kubernetesApiRef);

  const queries = useQueries({
    queries: selectedInstallations.map(installationName => {
      const namespaces = getInstallationOrganizationNamespaces(
        installationName,
        organizations,
      );

      return {
        queryKey: [installationName, 'clusters', namespaces.join()],
        queryFn: async () => {
          const requests = clusterGVK.flatMap(gvk => {
            return namespaces.map(namespace => {
              return kubernetesApi.proxy({
                clusterName: installationName,
                path: getK8sListPath(gvk, namespace),
              });
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
  });

  const queriesInfo = getInstallationsQueriesInfo(
    selectedInstallations,
    queries,
  );

  const resources: Resource<Cluster>[] = queriesInfo.installationsData.flatMap(
    ({ installationName, data }) =>
      data.map(resource => ({ installationName, ...resource })),
  );

  return {
    ...queriesInfo,
    resources,
    initialLoading: queriesInfo.initialLoading || isLoadingOrganizations,
  };
}
