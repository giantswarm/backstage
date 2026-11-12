import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';
import {
  ModelConfig,
  patchResource,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import { AgentManagerClient } from '../apis/AgentManagerClient';
import {
  organizationsUndecided,
  useOrganizationDirectory,
} from '../components/OrganizationDirectoryProvider';
import { preparedCredentialOperation } from '../lib/credentialOperations';
import { defaultMarkPatch, planDefaultMove } from '../lib/defaultModel';
import { MODEL_CONFIG_NAMESPACE, modelConfigOwner } from '../lib/modelConfigs';
import { organizationCredentialsRouteRef } from '../routes';
import {
  invalidateModelReads,
  readNamespaceModelConfigs,
  unmarkPrevious,
} from './defaultModelWrites';
import { useMusterPluginApi } from './useMusterPluginApi';

export type SetDefaultModelConfigResult = {
  /**
   * An organization's model whose key Secret is missing: agent-manager
   * prepared a credential request, and the mark moves once the key is saved
   * on this form.
   */
  form?: string;
};

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
 * An organization's model (its namespace in the organization directory) is
 * made the default through agent-manager, as the person:
 * `set_organization_model` with its name and `default: true`, which puts the
 * mark on it and takes it off every other model of the organization, two
 * marks included. The portal writes no ModelConfig there. The call sends no
 * key; only a model whose key Secret is missing answers a credential request,
 * whose form finishes the move. A namespace the directory cannot tell from
 * an organization's is refused, as `useSaveModelConfig` does.
 *
 * Call this from the page, inside the plugin's `QueryClientProvider` (see
 * `useDeleteModelConfig`).
 */
export function useSetDefaultModelConfig() {
  const kubernetesApi = useApi(kubernetesApiRef);
  const queryClient = useQueryClient();
  const musterApi = useMusterPluginApi();
  const organizations = useOrganizationDirectory();
  const formLink = useRouteRef(organizationCredentialsRouteRef);

  const mutation = useTrackedMutation<
    SetDefaultModelConfigResult,
    Error,
    SetDefaultModelConfigInput
  >({
    // A move that waits for a key is tracked where it is finished: the
    // credential form's save.
    event: ({ form }) =>
      form ? null : { name: 'AgentPlatform.defaultModelSet', attributes: {} },
    mutationFn: async ({ modelConfig, expected }) => {
      const installation = modelConfig.cluster;
      const namespace = modelConfig.getNamespace() ?? '';
      const target = modelConfig.getName();
      const organization = organizations.directory.get(namespace);
      if (organization) {
        if (!musterApi) {
          throw new Error(
            'agent-manager is not reachable on this installation, and an organization’s default model is set through it.',
          );
        }
        const result = await new AgentManagerClient(
          musterApi,
          installation,
        ).setOrganizationModel({
          namespace,
          name: target,
          default: true,
          requestId: crypto.randomUUID(),
        });
        const operation = preparedCredentialOperation(result);
        if (operation) {
          const form = formLink?.({
            installation,
            parent: organization.parent,
            name: organization.organization,
            operation,
          });
          if (!form) {
            throw new Error(
              'The model has no key yet, which is entered on the credential form, and this portal has none.',
            );
          }
          return { form };
        }
        await invalidateModelReads(queryClient, installation, namespace);
        return {};
      }
      const undecided =
        namespace === MODEL_CONFIG_NAMESPACE
          ? undefined
          : organizationsUndecided(organizations, installation);
      if (undecided) {
        throw new Error(
          `Could not tell whether ${namespace} is an organization's namespace, whose default model is set through agent-manager: ${undecided}`,
        );
      }
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
      return {};
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
