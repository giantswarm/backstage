import { useQueryClient } from '@tanstack/react-query';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import type { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import { AgentManagerClient } from '../apis/AgentManagerClient';
import { useOrganizationDirectory } from '../components/OrganizationDirectoryProvider';
import {
  credentialFormOf,
  type CredentialCommit,
  preparedCredentialOperation,
} from '../lib/credentialOperations';
import { modeArgument } from '../lib/organizations';
import { modelCredentialsRouteRef } from '../routes';
import { invalidateModelReads } from './defaultModelWrites';
import { modelScopeRefusal } from './modelScope';
import { useEnsureModelOperations } from './useEnsureModelOperations';
import { useMusterPluginApi } from './useMusterPluginApi';
import { useOrganizationContentMode } from './useOrganizationContentMode';

export type SetDefaultModelConfigResult = {
  form?: string;
  /**
   * The pull request that moves the mark, in mode commit: the model is not
   * the default until it is merged.
   */
  commit?: CredentialCommit;
};
export type SetDefaultModelConfigInput = {
  modelConfig: ModelConfig;
};

/**
 * Moves a namespace's default mark to a model (`set_organization_model` with
 * `default`), in its organization's mode ({@link useOrganizationContentMode}):
 * the installation's models, which are no organization's, live.
 */
export function useSetDefaultModelConfig() {
  const queryClient = useQueryClient();
  const musterApi = useMusterPluginApi();
  const ensureModelOperations = useEnsureModelOperations();
  const contentMode = useOrganizationContentMode();
  const organizations = useOrganizationDirectory();
  const credentialForm = useRouteRef(modelCredentialsRouteRef);
  const mutation = useTrackedMutation<
    SetDefaultModelConfigResult,
    Error,
    SetDefaultModelConfigInput
  >({
    event: ({ form, commit }) =>
      form || commit
        ? null
        : { name: 'AgentPlatform.defaultModelSet', attributes: {} },
    mutationFn: async ({ modelConfig }) => {
      if (!musterApi)
        throw new Error('agent-manager is not reachable on this installation.');
      const installation = modelConfig.cluster;
      const namespace = modelConfig.getNamespace() ?? '';
      const scopeRefusal = modelScopeRefusal(
        organizations,
        installation,
        namespace,
      );
      if (scopeRefusal) throw new Error(scopeRefusal);
      try {
        await ensureModelOperations(installation);
        const mode = await contentMode(installation, namespace);
        const result = await new AgentManagerClient(
          musterApi,
          installation,
        ).setOrganizationModel({
          namespace,
          name: modelConfig.getName(),
          default: true,
          requestId: crypto.randomUUID(),
          ...modeArgument(mode),
        });
        const operation = preparedCredentialOperation(result);
        if (!operation) return result.commit ? { commit: result.commit } : {};
        return {
          form: credentialFormOf(
            credentialForm,
            { installation, namespace, operation },
            'This model needs a credential, but the credential form is unavailable.',
          ),
        };
      } finally {
        await invalidateModelReads(queryClient, installation, namespace);
      }
    },
  });
  return {
    setDefault: mutation.mutateAsync,
    isSetting: mutation.isPending,
    error: mutation.error,
    /** The pull request the last move opened, in mode commit. */
    pullRequest: mutation.data?.commit,
    reset: mutation.reset,
  };
}
