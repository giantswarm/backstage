import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  deleteResource,
  LLMInferenceService,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { modelManagerApiRef } from '../apis';
import { managerRefOf } from '../lib/modelManagerServing';
import type { ServedModel } from '../lib/serving';
import { invalidateResourceReads } from './invalidateResourceReads';
import { useInvalidateModelManagerReadsFor } from './useServedModelAction';

/**
 * How a served model is stopped: through model-manager's `unload` (which also
 * removes the ModelConfig it created for the model), or by deleting the
 * LLMInferenceService as a CR with the user's own RBAC.
 */
export type StopServedModelVia = 'model-manager' | 'llminferenceservice';

export type StopServedModelInput = {
  model: ServedModel;
  via: StopServedModelVia;
};

/**
 * Stops a served model — deletes its LLMInferenceService. The llm-d
 * controller tears the workload down; the model's weight cache on the node
 * stays (the cache claim outlives the object by design), so serving it again
 * skips the download.
 *
 * Two ways, the caller's choice (`via`):
 *
 * - `model-manager` — the operating source deletes the object it composed
 *   and unwires the kagent ModelConfig it created for it. No RBAC of the
 *   user's involved: the gateway's JWT policy is the boundary. Only for rows
 *   model-manager listed (`managerRef`) and operates; a refusal of its is
 *   shown as it answered.
 * - `llminferenceservice` — the CR is deleted with the user's own RBAC: the
 *   route for an object model-manager does not operate (applied by hand or
 *   through GitOps). Any ModelConfig pointing at it is left in place: it is
 *   what agents are configured with, and serving the model again under the
 *   same name makes it work again without touching any agent. The Models
 *   table shows it as no longer served in the meantime.
 *
 * A bare `ServedModel` stops it as a CR. Only KServe-backed models are
 * stoppable; another source's models (Ollama) have their own lifecycle.
 */
export function useStopServedModel() {
  const kubernetesApi = useApi(kubernetesApiRef);
  const modelManagerApi = useApi(modelManagerApiRef);
  const queryClient = useQueryClient();
  const invalidateManagerReads = useInvalidateModelManagerReadsFor();

  const deleteObject = async (model: ServedModel) => {
    if (!model.namespace) {
      throw new Error(
        'Only KServe LLMInferenceServices can be stopped from here.',
      );
    }
    try {
      await deleteResource({
        kubernetesApi,
        cluster: model.installation,
        gvk: LLMInferenceService.getGVK(),
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
      LLMInferenceService.getGVK(),
    ]);
  };

  const mutation = useMutation({
    mutationFn: async (input: ServedModel | StopServedModelInput) => {
      const { model, via } =
        'via' in input && 'model' in input
          ? (input as StopServedModelInput)
          : {
              model: input as ServedModel,
              via: 'llminferenceservice' as const,
            };
      if (model.backend !== 'kserve') {
        throw new Error(
          'Only KServe LLMInferenceServices can be stopped from here.',
        );
      }

      if (via === 'model-manager') {
        if (!model.managerRef) {
          throw new Error(
            `model-manager does not list ${model.name}, so it cannot stop it; delete the LLMInferenceService instead.`,
          );
        }
        await modelManagerApi.unloadModel(
          model.installation,
          managerRefOf(model),
          { backend: model.backend },
        );
        await Promise.all([
          invalidateManagerReads(model.installation),
          invalidateResourceReads(queryClient, model.installation, [
            LLMInferenceService.getGVK(),
          ]),
        ]);
        return;
      }

      await deleteObject(model);
    },
  });

  return {
    stop: mutation.mutateAsync,
    isStopping: mutation.isPending,
    error: mutation.error as Error | null,
    reset: mutation.reset,
  };
}
