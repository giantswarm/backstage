import { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import { CustomResourceMatcher } from '../../lib/k8s/CustomResourceMatcher';
import { KubeObjectInterface } from '../../lib/k8s/KubeObject';
import { k8sMutationError } from './k8sMutation';
import { getK8sListPath } from './k8sPath';

/**
 * Lists a kind in one namespace, right now, bypassing the react-query cache
 * entirely.
 *
 * The counterpart to `useResources` for the case where a *decision* depends on
 * the answer rather than a render: a mutation that is about to delete something
 * on the strength of "nothing else references it" must not act on a list that
 * `staleTime` merely considers fresh. A sibling created seconds ago in another
 * tab would be invisible, and the destructive step is not repeatable.
 *
 * Prefer `useResources` for anything displayed. Reach for this only where
 * staleness changes the outcome.
 *
 * Errors follow the mutation convention: 403 is `ForbiddenError`, 404 is
 * `NotFoundError`. Callers deciding whether to destroy something must treat a
 * failure here as "cannot tell", never as "nothing found".
 */
export async function fetchResourceList<
  T extends KubeObjectInterface = KubeObjectInterface,
>(options: {
  kubernetesApi: KubernetesApi;
  cluster: string;
  gvk: CustomResourceMatcher;
  namespace?: string;
}): Promise<T[]> {
  const { kubernetesApi, cluster, gvk, namespace } = options;

  const response = await kubernetesApi.proxy({
    clusterName: cluster,
    path: getK8sListPath(gvk, { namespace }),
  });

  if (!response.ok) {
    throw await k8sMutationError(
      response,
      `Failed to list ${gvk.plural}${
        namespace ? ` in namespace ${namespace}` : ''
      } on ${cluster}`,
    );
  }

  const list: { items?: T[] } = await response.json();

  return list.items ?? [];
}
