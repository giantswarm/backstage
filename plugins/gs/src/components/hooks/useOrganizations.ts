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
  createSelfSubjectAccessReview,
  createSelfSubjectRulesReview,
  getOrganizationGVK,
  getOrganizationNames,
  getSelfSubjectAccessReviewGVK,
  getSelfSubjectAccessReviewNames,
  getSelfSubjectRulesReviewGVK,
  getSelfSubjectRulesReviewNames,
  List,
  Organization,
  Resource,
  SelfSubjectAccessReview,
  SelfSubjectRulesReview,
} from '@giantswarm/backstage-plugin-gs-common';
import { useApiVersionOverrides } from './useApiVersionOverrides';

async function checkListAllPermissions(
  installationName: string,
  resourceGVK: CustomResourceMatcher,
  kubernetesApi: KubernetesApi,
  apiVersionOverrides?: { [k: string]: string },
) {
  const apiVersion =
    apiVersionOverrides?.[getSelfSubjectAccessReviewNames().plural];
  const gvk = getSelfSubjectAccessReviewGVK(apiVersion);

  const accessReviewPath = getK8sCreatePath(gvk);
  const accessReviewRequestBody = createSelfSubjectAccessReview(
    {
      verb: 'list',
      group: resourceGVK.group,
      resource: resourceGVK.plural,
    },
    apiVersion,
  );

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

  const accessReview: SelfSubjectAccessReview =
    await accessReviewResponse.json();

  return Boolean(accessReview.status?.allowed);
}

async function getAvailableResources(
  installationName: string,
  resourceGVK: CustomResourceMatcher,
  kubernetesApi: KubernetesApi,
  apiVersionOverrides?: { [k: string]: string },
) {
  const apiVersion =
    apiVersionOverrides?.[getSelfSubjectRulesReviewNames().plural];
  const gvk = getSelfSubjectRulesReviewGVK(apiVersion);

  const rulesReviewPath = getK8sCreatePath(gvk);
  const rulesReviewRequestBody = createSelfSubjectRulesReview(apiVersion);

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

  const rulesReview: SelfSubjectRulesReview = await rulesReviewResponse.json();

  const resourceNames = [];
  if (rulesReview.status) {
    for (const rule of rulesReview.status.resourceRules) {
      if (
        rule.verbs.includes('get') &&
        rule.resources.includes(resourceGVK.plural) &&
        rule.resourceNames
      ) {
        resourceNames.push(...rule.resourceNames);
      }
    }
  }

  return resourceNames;
}

async function checkListPermissions(
  installationName: string,
  resourceGVK: CustomResourceMatcher,
  kubernetesApi: KubernetesApi,
  apiVersionOverrides: { [k: string]: string },
): Promise<{
  canListAll: boolean;
  availableResources: string[];
}> {
  const canListAll = await checkListAllPermissions(
    installationName,
    resourceGVK,
    kubernetesApi,
    apiVersionOverrides,
  );

  if (canListAll) {
    return {
      canListAll: true,
      availableResources: [],
    };
  }

  const availableResources = await getAvailableResources(
    installationName,
    resourceGVK,
    kubernetesApi,
    apiVersionOverrides,
  );

  return {
    canListAll: false,
    availableResources,
  };
}

export function useOrganizations(installations?: string[]) {
  const { selectedInstallations: savedInstallations } = useInstallations();
  const selectedInstallations = installations ?? savedInstallations;

  const apiVersionOverrides = useApiVersionOverrides(selectedInstallations);

  const installationsGVKs = Object.fromEntries(
    selectedInstallations.map(installationName => {
      const apiVersion =
        apiVersionOverrides[installationName]?.[getOrganizationNames().plural];
      const gvk = getOrganizationGVK(apiVersion);

      return [installationName, gvk];
    }),
  );

  const kubernetesApi = useApi(kubernetesApiRef);
  const queries = useQueries({
    queries: selectedInstallations.map(installationName => {
      const gvk = installationsGVKs[installationName];

      return {
        queryKey: [installationName, gvk.plural],
        queryFn: async () => {
          const { canListAll, availableResources } = await checkListPermissions(
            installationName,
            gvk,
            kubernetesApi,
            apiVersionOverrides[installationName],
          );

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
