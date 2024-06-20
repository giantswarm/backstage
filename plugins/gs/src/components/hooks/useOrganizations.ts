import { KubernetesApi, kubernetesApiRef } from '@backstage/plugin-kubernetes';
import { useInstallations } from './useInstallations';
import { useApi } from '@backstage/core-plugin-api';
import { useQueries } from '@tanstack/react-query';
import { getInstallationsQueriesInfo } from './utils/queries';
import {
  getK8sCreatePath,
  getK8sGetPath,
  getK8sListPath,
} from './utils/k8sPath';
import { CustomResourceMatcher } from '@backstage/plugin-kubernetes-common';
import {
  List,
  Organization,
  Resource,
  organizationGVK,
  selfSubjectAccessReviewGVK,
  selfSubjectRulesReviewGVK,
} from '@internal/plugin-gs-common';

async function checkListPermissions(
  installationName: string,
  gvk: CustomResourceMatcher,
  kubernetesApi: KubernetesApi,
): Promise<{
  canListAll: boolean;
  availableResources: string[];
}> {
  const accessReviewPath = getK8sCreatePath(selfSubjectAccessReviewGVK);
  const accessReviewRequestBody = {
    apiVersion: 'authorization.k8s.io/v1',
    kind: 'SelfSubjectAccessReview',
    spec: {
      resourceAttributes: {
        verb: 'list',
        group: gvk.group,
        resource: gvk.plural,
      },
    },
  };
  const accessReviewResponse = await kubernetesApi.proxy({
    clusterName: installationName,
    path: accessReviewPath,
    init: {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(accessReviewRequestBody),
    },
  });

  const accessReview = await accessReviewResponse.json();

  if (accessReview.status?.allowed) {
    return {
      canListAll: true,
      availableResources: [],
    };
  }

  const rulesReviewPath = getK8sCreatePath(selfSubjectRulesReviewGVK);
  const rulesReviewRequestBody = {
    apiVersion: 'authorization.k8s.io/v1',
    kind: 'SelfSubjectRulesReview',
    spec: {
      namespace: 'default',
    },
  };

  const rulesReviewResponse = await kubernetesApi.proxy({
    clusterName: installationName,
    path: rulesReviewPath,
    init: {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rulesReviewRequestBody),
    },
  });

  const rulesReview = await rulesReviewResponse.json();

  const resourceNames = [];
  if (rulesReview.status) {
    for (const rule of rulesReview.status.resourceRules) {
      if (
        rule.verbs.includes('get') &&
        rule.resources.includes(gvk.plural) &&
        rule.resourceNames
      ) {
        resourceNames.push(...rule.resourceNames);
      }
    }
  }

  return {
    canListAll: false,
    availableResources: resourceNames,
  };
}

export function useOrganizations(installations?: string[]) {
  const { selectedInstallations: savedInstallations } = useInstallations();
  const selectedInstallations = installations ?? savedInstallations;
  const kubernetesApi = useApi(kubernetesApiRef);
  const queries = useQueries({
    queries: selectedInstallations.flatMap(installationName => {
      return organizationGVK.map(gvk => {
        return {
          queryKey: [installationName, gvk.plural],
          queryFn: async () => {
            const { canListAll, availableResources } =
              await checkListPermissions(installationName, gvk, kubernetesApi);

            if (canListAll) {
              const response = await kubernetesApi.proxy({
                clusterName: installationName,
                path: getK8sListPath(gvk),
              });

              const list: List<Organization> = await response.json();

              return list.items;
            }

            const getRequests = availableResources.map(resourceName =>
              kubernetesApi.proxy({
                clusterName: installationName,
                path: getK8sGetPath(gvk, resourceName),
              }),
            );

            const getResponses = await Promise.all(getRequests);

            const items: Organization[] = await Promise.all(
              getResponses.map(response => response.json()),
            );

            return items;
          },
        };
      });
    }),
  });

  const queriesInfo = getInstallationsQueriesInfo(
    selectedInstallations,
    queries,
  );

  const resources: Resource<Organization>[] =
    queriesInfo.installationsData.flatMap(({ installationName, data }) =>
      data.map(resource => ({ installationName, ...resource })),
    );

  return {
    ...queriesInfo,
    resources,
  };
}
