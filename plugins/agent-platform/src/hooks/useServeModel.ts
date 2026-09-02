import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createResource,
  InferenceService,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { invalidateResourceReads } from './invalidateResourceReads';

export type ServeModelInput = {
  installation: string;
  /** The serving namespace from the discovery config. */
  namespace: string;
  /** The composed InferenceService (see `composeInferenceService`). */
  manifest: Record<string, unknown>;
};

/**
 * Creates the InferenceService a preset was composed into.
 *
 * Straight through the Kubernetes proxy with the caller's own OIDC token, so
 * the apiserver's RBAC is the authorization (a 403 surfaces as a
 * `ForbiddenError` with the apiserver's message) — the same path the
 * ModelConfig form uses, not the scaffolder. Success here means the CR was
 * accepted, nothing more: whether the model comes up is the KServe
 * controller's verdict, read back from the CR's status by the Serving table.
 */
export function useServeModel() {
  const kubernetesApi = useApi(kubernetesApiRef);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      installation,
      namespace,
      manifest,
    }: ServeModelInput) => {
      await createResource({
        kubernetesApi,
        cluster: installation,
        gvk: InferenceService.getGVK(),
        namespace,
        manifest,
      });
      await invalidateResourceReads(queryClient, installation, [
        InferenceService.getGVK(),
      ]);
    },
  });

  return {
    serve: mutation.mutateAsync,
    isServing: mutation.isPending,
    error: mutation.error as Error | null,
    reset: mutation.reset,
  };
}
