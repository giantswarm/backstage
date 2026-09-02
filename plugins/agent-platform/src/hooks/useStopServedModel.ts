import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  deleteResource,
  InferenceService,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { modelManagerApiRef } from '../apis';
import { managerRefOf } from '../lib/modelManagerServing';
import type { ServedModel } from '../lib/serving';
import { invalidateResourceReads } from './invalidateResourceReads';
import { useInvalidateModelManagerReadsFor } from './useServedModelAction';

/**
 * How a served model is stopped: through model-manager's `unload` (which also
 * removes the ModelConfig it created for the model), or by deleting the
 * InferenceService as a CR with the user's own RBAC.
 */
export type StopServedModelVia = 'model-manager' | 'inferenceservice';

export type StopServedModelInput = {
  model: ServedModel;
  via: StopServedModelVia;
};

/**
 * Stops a served model — deletes its InferenceService. KServe tears the
 * predictor down; the model's weight cache on the node stays (the cache claim
 * outlives the InferenceService by design), so serving it again skips the
 * download.
 *
 * Two ways, the caller's choice (`via`):
 *
 * - `model-manager` — the operating source deletes it and unwires the kagent
 *   ModelConfig it created for it; one it merely recognises as the portal's is
 *   left alone. No RBAC of the user's involved: the gateway's JWT policy is the
 *   boundary. Only for rows model-manager listed (`managerRef`).
 * - `inferenceservice` — the CR is deleted with the user's own RBAC. The
 *   kagent ModelConfig the portal auto-wired is deliberately left in place: it
 *   is what agents are configured with, and serving the model again under the
 *   same name makes it work again without touching any agent. The Models table
 *   shows it as no longer served in the meantime.
 *
 * A bare `ServedModel` stops it as a CR. Only KServe-backed models are
 * stoppable; another source's models (Ollama) have their own lifecycle.
 */
export function useStopServedModel() {
  const kubernetesApi = useApi(kubernetesApiRef);
  const modelManagerApi = useApi(modelManagerApiRef);
  const queryClient = useQueryClient();
  const invalidateManagerReads = useInvalidateModelManagerReadsFor();

  const mutation = useMutation({
    mutationFn: async (input: ServedModel | StopServedModelInput) => {
      const { model, via } =
        'via' in input && 'model' in input
          ? (input as StopServedModelInput)
          : { model: input as ServedModel, via: 'inferenceservice' as const };
      if (model.backend !== 'kserve') {
        throw new Error(
          'Only KServe InferenceServices can be stopped from here.',
        );
      }

      if (via === 'model-manager') {
        if (!model.managerRef) {
          throw new Error(
            `model-manager does not list ${model.name}, so it cannot stop it; delete the InferenceService instead.`,
          );
        }
        await modelManagerApi.unloadModel(
          model.installation,
          managerRefOf(model),
        );
        await Promise.all([
          invalidateManagerReads(model.installation),
          invalidateResourceReads(queryClient, model.installation, [
            InferenceService.getGVK(),
          ]),
        ]);
        return;
      }

      if (!model.namespace) {
        throw new Error(
          'Only KServe InferenceServices can be stopped from here.',
        );
      }
      try {
        await deleteResource({
          kubernetesApi,
          cluster: model.installation,
          gvk: InferenceService.getGVK(),
          name: model.name,
          namespace: model.namespace,
        });
      } catch (error) {
        // Already gone — someone else stopped it. The goal is met.
        if ((error as Error).name !== 'NotFoundError') {
          throw error;
        }
      }
      await invalidateResourceReads(queryClient, model.installation, [
        InferenceService.getGVK(),
      ]);
    },
  });

  return {
    stop: mutation.mutateAsync,
    isStopping: mutation.isPending,
    error: mutation.error as Error | null,
    reset: mutation.reset,
  };
}
