import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import {
  ModelConfig,
  patchResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { defaultMarkPatch, planDefaultMove } from '../lib/defaultModel';
import { modelConfigOwner } from '../lib/modelConfigs';
import {
  invalidateModelReads,
  readNamespaceModelConfigs,
  unmarkPrevious,
} from './defaultModelWrites';

export type SetDefaultModelConfigInput = {
  modelConfig: ModelConfig;
  /** The models the page showed as marked when the person asked. */
  expected: readonly string[];
};

/**
 * Makes a model its namespace's default, as the signed-in person: the mark
 * goes on the model, then comes off the one that had it. A fresh read of the
 * namespace refuses the move when a mark the page did not show appeared
 * meanwhile, or when the marked model is one a tool owns (`planDefaultMove`),
 * so the portal never leaves two marks behind.
 *
 * Call this from the page, inside the plugin's `QueryClientProvider` (see
 * `useDeleteModelConfig`).
 */
export function useSetDefaultModelConfig() {
  const kubernetesApi = useApi(kubernetesApiRef);
  const queryClient = useQueryClient();

  const mutation = useTrackedMutation({
    event: () => ({ name: 'AgentPlatform.defaultModelSet', attributes: {} }),
    mutationFn: async ({
      modelConfig,
      expected,
    }: SetDefaultModelConfigInput) => {
      const installation = modelConfig.cluster;
      const namespace = modelConfig.getNamespace() ?? '';
      const target = modelConfig.getName();
      const items = await readNamespaceModelConfigs({
        kubernetesApi,
        installation,
        namespace,
      });
      const previous = planDefaultMove({
        modelConfigs: items,
        target,
        expected,
        ownerOf: modelConfigOwner,
      });

      await patchResource({
        kubernetesApi,
        cluster: installation,
        gvk: modelConfig.getResolvedGVK(),
        name: target,
        namespace,
        patch: defaultMarkPatch(true),
      });
      try {
        await unmarkPrevious({ kubernetesApi, installation, target, previous });
      } finally {
        await invalidateModelReads(queryClient, installation, namespace);
      }
    },
  });

  const { mutateAsync, isPending, error, reset } = mutation;
  return useMemo(
    () => ({
      setDefault: mutateAsync,
      isSetting: isPending,
      error: error as Error | null,
      reset,
    }),
    [mutateAsync, isPending, error, reset],
  );
}

export type UseSetDefaultModelConfigResult = ReturnType<
  typeof useSetDefaultModelConfig
>;
