import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  deleteResource,
  InferenceService,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import type { ServedModel } from '../lib/serving';
import { invalidateResourceReads } from './invalidateResourceReads';

/**
 * Stops a served model: deletes its InferenceService, with the user's own
 * RBAC. KServe tears the predictor down; the model's weight cache on the node
 * stays (the cache claim outlives the InferenceService by design), so serving
 * it again skips the download.
 *
 * The kagent ModelConfig the portal auto-wired is deliberately left in place:
 * it is what agents are configured with, and serving the model again under
 * the same name makes it work again without touching any agent. The Models
 * table shows it as no longer served in the meantime.
 *
 * Only KServe-backed models are stoppable from here; another source's models
 * (Ollama via model-manager) have their own lifecycle and are refused.
 */
export function useStopServedModel() {
  const kubernetesApi = useApi(kubernetesApiRef);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (model: ServedModel) => {
      if (model.backend !== 'kserve' || !model.namespace) {
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
