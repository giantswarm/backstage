import type { KubernetesApi } from '@backstage/plugin-kubernetes-react';
import type { QueryClient } from '@tanstack/react-query';
import {
  fetchResourceList,
  ModelConfig,
  patchResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { defaultMarkPatch } from '../lib/defaultModel';
import { musterAgentManagerModelConfigsQueryKey } from '../lib/queryKeys';

/**
 * The ModelConfigs of one namespace, read now rather than from the query
 * cache: whether a write may add the default mark depends on the marks there
 * at that moment. A failed read refuses the write.
 */
export async function readNamespaceModelConfigs({
  kubernetesApi,
  installation,
  namespace,
}: {
  kubernetesApi: KubernetesApi;
  installation: string;
  namespace: string;
}): Promise<ModelConfig[]> {
  try {
    const items = await fetchResourceList<ModelConfig['jsonData']>({
      kubernetesApi,
      cluster: installation,
      gvk: ModelConfig.getGVK(),
      namespace,
    });
    return items.map(item => new ModelConfig(item, installation));
  } catch (error) {
    throw new Error(
      `Could not read the models of ${namespace} to check which one is the default, so nothing was changed. Reason: ${
        (error as Error).message
      }`,
    );
  }
}

/**
 * Takes the default mark off `previous`, after the new default carries it.
 * A failure leaves two marks, which is no default, and says so.
 */
export async function unmarkPrevious({
  kubernetesApi,
  installation,
  target,
  previous,
}: {
  kubernetesApi: KubernetesApi;
  installation: string;
  target: string;
  previous: readonly ModelConfig[];
}): Promise<void> {
  for (const modelConfig of previous) {
    try {
      await patchResource({
        kubernetesApi,
        cluster: installation,
        gvk: modelConfig.getResolvedGVK(),
        name: modelConfig.getName(),
        namespace: modelConfig.getNamespace(),
        patch: defaultMarkPatch(false),
      });
    } catch (error) {
      throw new Error(
        `${target} is marked as the default, but the mark on ${modelConfig.getName()} could not be removed, so there is no default until it is. Make ${target} the default again to retry. Reason: ${
          (error as Error).message
        }`,
      );
    }
  }
}

/** Drops the cached reads a default move changes. */
export async function invalidateModelReads(
  queryClient: QueryClient,
  installation: string,
  namespace: string,
): Promise<void> {
  const gvk = ModelConfig.getGVK();
  await Promise.all([
    ...['list', 'get'].map(operation =>
      queryClient.invalidateQueries({
        queryKey: [
          'cluster',
          installation,
          operation,
          gvk.group,
          gvk.apiVersion,
          gvk.plural,
        ].filter(Boolean),
      }),
    ),
    queryClient.invalidateQueries({
      queryKey: musterAgentManagerModelConfigsQueryKey(installation, namespace),
    }),
  ]);
}
