import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
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
  isListenerRouted,
  keySecretName,
  MODEL_CONFIG_NAMESPACE,
  ModelConfigFormValues,
  modelConfigOwner,
  planKeySecret,
} from '../lib/modelConfigs';
import { markedIn, planDefaultMove } from '../lib/defaultModel';
import {
  invalidateModelReads,
  readNamespaceModelConfigs,
  unmarkPrevious,
} from './defaultModelWrites';
import { useOrganizationDirectory } from '../components/OrganizationDirectoryProvider';

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
  /** Create only: where the model goes; the platform namespace when absent. */
  namespace?: string;
  /**
   * Create only: make the new model the namespace default, taking the mark
   * off `expectedMarks`, the models the form showed as marked.
   */
  makeDefault?: boolean;
  expectedMarks?: readonly string[];
};

export type SaveModelConfigResult = {
  /** Whether the save put the default mark on the model. */
  isDefault: boolean;
};

/**
 * Creates or updates a ModelConfig, including its key Secret, outside an
 * organization's namespace: there it refuses, since an organization's model
 * is saved through agent-manager (`useSaveOrganizationModel`).
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
 *
 * A create carries the namespace's default mark when no model there claims
 * the default (`markedIn`), read fresh, or when `makeDefault` asks
 * for it; then the mark comes off the
 * model that had it (`planDefaultMove`, which refuses a mark the form did not
 * show). An edit leaves the mark as it is.
 */
export function useSaveModelConfig() {
  const kubernetesApi = useApi(kubernetesApiRef);
  const queryClient = useQueryClient();
  const { directory } = useOrganizationDirectory();

  const mutation = useTrackedMutation({
    event: (_data, { original }) => ({
      name: original
        ? 'AgentPlatform.modelUpdated'
        : 'AgentPlatform.modelCreated',
      attributes: {},
    }),
    mutationFn: async ({
      installation,
      values,
      original,
      namespace: requestedNamespace,
      makeDefault = false,
      expectedMarks = [],
    }: SaveModelConfigInput): Promise<SaveModelConfigResult> => {
      const isEdit = Boolean(original);
      const namespace =
        original?.getNamespace() ??
        requestedNamespace ??
        MODEL_CONFIG_NAMESPACE;
      if (isListenerRouted(namespace, directory)) {
        // An organization's model is saved through agent-manager
        // (`useSaveOrganizationModel`): its admins may not write the key
        // Secret from here, and its key is entered on the credential form.
        throw new Error(
          `${namespace} is an organization's namespace: its models are saved through agent-manager, not written here.`,
        );
      }
      const plan = planKeySecret(values, {
        isEdit,
        originalProvider: original?.getProvider(),
        namespace,
        directory,
      });

      let markDefault = false;
      let previousDefaults: ModelConfig[] = [];
      if (!original) {
        const items = await readNamespaceModelConfigs({
          kubernetesApi,
          installation,
          namespace,
        });
        if (makeDefault) {
          previousDefaults = planDefaultMove({
            modelConfigs: items,
            target: values.name.trim(),
            expected: expectedMarks,
            ownerOf: modelConfigOwner,
          });
          markDefault = true;
        } else {
          markDefault = markedIn(items, namespace).length === 0;
        }
      }
      let createdSecret = false;

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
          createdSecret = true;
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
          patch: buildModelConfigPatch(values, plan, original, directory),
        });
      } else {
        try {
          await createResource({
            kubernetesApi,
            cluster: installation,
            gvk: ModelConfig.getGVK(),
            namespace,
            manifest: buildModelConfigManifest(values, plan, namespace, {
              markDefault,
              directory,
            }),
          });
        } catch (error) {
          // A Secret this save created for a model admission refused would
          // only be left behind. Best effort: the refusal is what to report.
          if (createdSecret && plan.action === 'write') {
            try {
              await deleteResource({
                kubernetesApi,
                cluster: installation,
                gvk: SECRET_GVK,
                name: plan.name,
                namespace,
              });
            } catch {
              // Keep reporting the refusal.
            }
          }
          throw error;
        }
        try {
          await unmarkPrevious({
            kubernetesApi,
            installation,
            target: values.name.trim(),
            previous: previousDefaults,
          });
        } catch (error) {
          await invalidateModelReads(queryClient, installation, namespace);
          throw error;
        }
      }

      // Best-effort cleanup after a switch to a keyless provider: our own
      // conventional Secret is 1:1 with the model (it is named after it), so
      // it goes when the CR no longer references any. A foreign Secret the CR
      // used to reference is not ours to remove. Failures are swallowed — the
      // save has succeeded, and an orphaned placeholder Secret is inert.
      if (
        plan.action === 'none' &&
        original?.getApiKeySecret() ===
          keySecretName(values.name, namespace, directory)
      ) {
        try {
          await deleteResource({
            kubernetesApi,
            cluster: installation,
            gvk: SECRET_GVK,
            name: keySecretName(values.name, namespace, directory),
            namespace,
          });
        } catch {
          // Keep the Secret; reporting a successful save as failed is worse.
        }
      }

      // Invalidate rather than editing the cache: the QueryClient is persisted
      // to localStorage, so a stale object could be rehydrated on reload.
      await invalidateModelReads(queryClient, installation, namespace);
      return { isDefault: markDefault };
    },
  });

  return {
    save: mutation.mutateAsync,
    isSaving: mutation.isPending,
    error: mutation.error as Error | null,
    reset: mutation.reset,
  };
}
