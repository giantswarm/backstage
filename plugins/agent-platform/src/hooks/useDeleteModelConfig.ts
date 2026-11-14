import { useCallback, useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import {
  Agent,
  CustomResourceMatcher,
  fetchResourceList,
  ModelConfig,
  useSelfSubjectAccessReview,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { modelConfigEditOwner } from '../lib/modelConfigs';
import { useOrganizationDirectory } from '../components/OrganizationDirectoryProvider';
import { useAgentManagerClient } from './useAgentManager';

/**
 * Deleting one ModelConfig, and the checks that decide whether to offer it.
 *
 * Two gates decide the affordance: the CR must not be tool-owned (rendered by
 * Helm, applied by a Flux Kustomization, or asserted by agentlab — all of
 * which would fight the deletion or quietly re-create the model), and the
 * cluster must say this user may delete it (`SelfSubjectAccessReview`, which
 * decides what is *shown* — authorization stays the apiserver's, since the
 * proxy forwards the user's own OIDC token).
 *
 * The mutation refuses to delete a model an `Agent` still references. That
 * check reads a **fresh** list at mutation time, not the query cache — a
 * cached list is the wrong basis for destroying something other objects
 * depend on — and a failed read refuses the delete: unlike an agent's shared
 * chart source (which agent-manager keeps whenever it cannot tell), here the
 * unsafe direction is proceeding, since deleting a referenced model breaks
 * every agent on it.
 *
 * Call this from inside the plugin's `QueryClientProvider` — from the page,
 * not the actions element handed to `useProvidePageHeaderActions` (see
 * `useDeleteAgent`). `modelConfig` is optional for the same reason: the page
 * has none while it is still loading.
 */
export function useDeleteModelConfig(modelConfig: ModelConfig | undefined) {
  const kubernetesApi = useApi(kubernetesApiRef);
  const queryClient = useQueryClient();

  const cluster = modelConfig?.cluster ?? '';
  const client = useAgentManagerClient(cluster);
  const { directory } = useOrganizationDirectory();
  const name = modelConfig?.getName();
  const namespace = modelConfig?.getNamespace();
  const owner = modelConfig
    ? modelConfigEditOwner(modelConfig, directory)
    : undefined;

  const { allowed: isAllowed, isLoading: isCheckingPermission } =
    useSelfSubjectAccessReview(
      cluster,
      {
        group: ModelConfig.group,
        resource: ModelConfig.plural,
        namespace,
        // Named, so a grant restricted via `resourceNames` answers accurately.
        name,
        verb: 'delete',
      },
      { enabled: Boolean(modelConfig) },
    );

  const invalidateReads = async (gvks: CustomResourceMatcher[]) => {
    await Promise.all(
      gvks.flatMap(gvk =>
        ['list', 'get'].map(operation =>
          queryClient.invalidateQueries({
            queryKey: [
              'cluster',
              cluster,
              operation,
              gvk.group,
              gvk.apiVersion,
              gvk.plural,
            ].filter(Boolean),
          }),
        ),
      ),
    );
  };

  const mutation = useTrackedMutation({
    // Only a deletion this call made: a model already gone was deleted by
    // someone else, or by an earlier attempt that reported it already.
    event: ({ deleted }) =>
      deleted ? { name: 'AgentPlatform.modelDeleted', attributes: {} } : null,
    mutationFn: async () => {
      if (!modelConfig || !name) {
        throw new Error(
          'The model could not be read, so it cannot be deleted from here. Try reloading the page.',
        );
      }

      // Agents resolve `spec.modelConfig.name` in their own namespace,
      // and this plugin co-locates agents with their model — so the model's
      // namespace is where its dependents are. A read failure surfaces as a
      // refusal rather than an empty list read as "nothing references it".
      let referencingAgents: string[];
      try {
        const items = await fetchResourceList<Agent['jsonData']>({
          kubernetesApi,
          cluster,
          gvk: Agent.getGVK(),
          namespace,
        });
        referencingAgents = items
          .map(item => new Agent(item, cluster))
          .filter(agent => {
            const ref = agent.getModelConfigName();
            return ref === name || ref === `${namespace}/${name}`;
          })
          .map(agent => agent.getName());
      } catch (error) {
        throw new Error(
          `Could not verify that no agent still uses this model, so it was not deleted. Reason: ${
            (error as Error).message
          }`,
        );
      }

      if (referencingAgents.length > 0) {
        throw new Error(
          `This model is still used by ${
            referencingAgents.length === 1 ? 'agent' : 'agents'
          } ${referencingAgents.join(', ')}. Delete or re-configure ${
            referencingAgents.length === 1 ? 'it' : 'them'
          } first.`,
        );
      }

      const gvk = modelConfig.getResolvedGVK();
      if (!client || !namespace) {
        throw new Error('agent-manager is not reachable on this installation.');
      }
      const result = await client.deleteModel(namespace, name);
      await invalidateReads([gvk]);
      return { deleted: Boolean(result.deleted) };
    },
  });

  const { mutateAsync, reset } = mutation;
  const deleteModelConfig = useCallback(async () => {
    await mutateAsync();
  }, [mutateAsync]);

  // Memoized as a whole because the page passes this straight into the element
  // it registers as the header's actions (see useDeleteAgent).
  return useMemo(
    () => ({
      /** Whether to offer the deletion at all. */
      isDeletable: Boolean(modelConfig) && !owner && isAllowed,
      /** Still establishing the above. Withhold the affordance rather than guess. */
      isCheckingDeletable: Boolean(modelConfig) && isCheckingPermission,
      /**
       * The tool that owns the CR (`'Helm'`, `'Flux'`, `'agentlab'`, …), when
       * that is what withholds the affordance — for the page to explain.
       */
      owner,
      deleteModelConfig,
      isDeleting: mutation.isPending,
      error: mutation.error as Error | null,
      reset,
    }),
    [
      modelConfig,
      owner,
      isAllowed,
      isCheckingPermission,
      deleteModelConfig,
      mutation.isPending,
      mutation.error,
      reset,
    ],
  );
}

/** What {@link useDeleteModelConfig} hands to the confirmation UI. */
export type UseDeleteModelConfigResult = ReturnType<
  typeof useDeleteModelConfig
>;
