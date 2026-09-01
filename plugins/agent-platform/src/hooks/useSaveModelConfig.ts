import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createResource,
  CustomResourceMatcher,
  deleteResource,
  ModelConfig,
  patchResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import {
  buildKeySecretManifest,
  buildKeySecretPatch,
  buildModelConfigManifest,
  buildModelConfigPatch,
  keySecretName,
  MODEL_CONFIG_NAMESPACE,
  ModelConfigFormValues,
  planKeySecret,
} from '../lib/modelConfigs';

/**
 * Spelled out rather than `Secret.getGVK()`: the Secret class sets no `group`
 * static (core resources have none), so its GVK would carry `group: undefined`
 * — fine for path building, but a mismatch for the string-keyed query keys.
 */
const SECRET_GVK: CustomResourceMatcher = {
  group: '',
  apiVersion: 'v1',
  plural: 'secrets',
  isCore: true,
};

export type SaveModelConfigInput = {
  /** Installation / management cluster the model lands on. */
  installation: string;
  values: ModelConfigFormValues;
  /** The CR being edited; absent for a create. */
  original?: ModelConfig;
};

/**
 * Creates or updates a ModelConfig, including its key Secret.
 *
 * All writes go straight through the Kubernetes proxy with the caller's own
 * OIDC token, so the apiserver's RBAC is the authorization — and the API key
 * never leaves the request: it is deliberately **not** routed through the
 * `kube:apply` scaffolder path the agent deploy uses, because a scaffolder
 * task persists its `values` (and echoes the applied manifest into the task
 * output), which would store the key in plain text.
 *
 * The Secret is written before the ModelConfig: the controller hashes the
 * referenced Secret into the ModelConfig's status, so the reference should
 * resolve on its first look.
 */
export function useSaveModelConfig() {
  const kubernetesApi = useApi(kubernetesApiRef);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      installation,
      values,
      original,
    }: SaveModelConfigInput) => {
      const isEdit = Boolean(original);
      const namespace = original?.getNamespace() ?? MODEL_CONFIG_NAMESPACE;
      const plan = planKeySecret(values, isEdit);

      if (plan.action === 'write') {
        // Create-or-replace, mirroring what `kubectl apply` would do. The
        // patch clears previous keys (`data: null`) so a provider switch does
        // not leave the old canonical key behind; a 404 means no Secret yet.
        try {
          await patchResource({
            kubernetesApi,
            cluster: installation,
            gvk: SECRET_GVK,
            name: plan.name,
            namespace,
            patch: buildKeySecretPatch(plan),
          });
        } catch (error) {
          if ((error as Error).name !== 'NotFoundError') {
            throw error;
          }
          await createResource({
            kubernetesApi,
            cluster: installation,
            gvk: SECRET_GVK,
            namespace,
            manifest: buildKeySecretManifest(plan, namespace),
          });
        }
      }

      if (original) {
        await patchResource({
          kubernetesApi,
          cluster: installation,
          // The version the object was actually read at — see getResolvedGVK.
          gvk: original.getResolvedGVK(),
          name: original.getName(),
          namespace,
          patch: buildModelConfigPatch(values, plan, original),
        });
      } else {
        await createResource({
          kubernetesApi,
          cluster: installation,
          gvk: ModelConfig.getGVK(),
          namespace,
          manifest: buildModelConfigManifest(values, plan, namespace),
        });
      }

      // Best-effort cleanup after a switch to a keyless provider: our own
      // conventional Secret is 1:1 with the model (it is named after it), so
      // it goes when the CR no longer references any. A foreign Secret the CR
      // used to reference is not ours to remove. Failures are swallowed — the
      // save has succeeded, and an orphaned placeholder Secret is inert.
      if (
        plan.action === 'none' &&
        original?.getApiKeySecret() === keySecretName(values.name)
      ) {
        try {
          await deleteResource({
            kubernetesApi,
            cluster: installation,
            gvk: SECRET_GVK,
            name: keySecretName(values.name),
            namespace,
          });
        } catch {
          // Keep the Secret; reporting a successful save as failed is worse.
        }
      }

      // Invalidate rather than editing the cache: the QueryClient is persisted
      // to localStorage, so a stale object could be rehydrated on reload.
      const gvk = original?.getResolvedGVK() ?? ModelConfig.getGVK();
      await Promise.all(
        ['list', 'get'].map(operation =>
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
      );
    },
  });

  return {
    save: mutation.mutateAsync,
    isSaving: mutation.isPending,
    error: mutation.error as Error | null,
    reset: mutation.reset,
  };
}
