import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useQueries } from '@tanstack/react-query';
import {
  createSelfSubjectAccessReview,
  ModelConfig,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { MODEL_CONFIG_NAMESPACE } from '../lib/modelConfigs';
import { useAgentManagerInfo } from './useAgentManager';
import { useOrganizationDirectory } from '../components/OrganizationDirectoryProvider';

export type ModelNamespaces = {
  /** Where the person may add a model, the platform first. */
  namespaces: string[];
  /**
   * True until every candidate on the installation is known and checked:
   * agent-manager's namespaces, which of them are Organizations', and the
   * access reviews. Until then an Organization the person administers may
   * still be missing. Other installations' reads are not waited for.
   */
  isLoading: boolean;
};

/**
 * Where the person may add a model on `installation`: the platform namespace,
 * and each Organization namespace agent-manager manages for them in which the
 * cluster says they may create ModelConfigs (an Organization's admins). The
 * platform namespace stays offered while its review is out or failed: the
 * apiserver still decides on the write.
 */
export function useModelNamespaces(
  installation: string | undefined,
): ModelNamespaces {
  const kubernetesApi = useApi(kubernetesApiRef);
  const { info, isLoading: isLoadingInfo } = useAgentManagerInfo(installation);
  // The organization namespaces among them, as agent-manager names them.
  const { directory, isLoadingOf } = useOrganizationDirectory();
  const organizations = (info?.namespaces?.managed ?? []).filter(namespace =>
    directory.has(namespace),
  );
  const candidates = [MODEL_CONFIG_NAMESPACE, ...organizations];

  const reviews = useQueries({
    queries: candidates.map(namespace => ({
      queryKey: [
        'agent-platform',
        'model-namespace-access',
        installation ?? '',
        namespace,
      ],
      enabled: Boolean(installation),
      staleTime: 60_000,
      retry: false,
      queryFn: () =>
        createSelfSubjectAccessReview({
          kubernetesApi,
          cluster: installation!,
          resourceAttributes: {
            group: ModelConfig.group,
            resource: ModelConfig.plural,
            namespace,
            verb: 'create',
          },
        }),
    })),
  });

  const namespaces = candidates.filter((namespace, index) => {
    const review = reviews[index];
    if (namespace === MODEL_CONFIG_NAMESPACE) {
      return review.data !== false;
    }
    return review.data === true;
  });

  return {
    namespaces,
    isLoading:
      installation !== undefined &&
      (isLoadingInfo ||
        isLoadingOf(installation) ||
        reviews.some(review => review.isPending)),
  };
}
