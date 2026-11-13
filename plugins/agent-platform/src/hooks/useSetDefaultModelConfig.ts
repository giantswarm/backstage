import { useQueryClient } from '@tanstack/react-query';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import type { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import { AgentManagerClient } from '../apis/AgentManagerClient';
import { useOrganizationDirectory } from '../components/OrganizationDirectoryProvider';
import { preparedCredentialOperation } from '../lib/credentialOperations';
import {
  organizationCredentialsRouteRef,
  modelCredentialsRouteRef,
} from '../routes';
import { invalidateModelReads } from './defaultModelWrites';
import { useMusterPluginApi } from './useMusterPluginApi';

export type SetDefaultModelConfigResult = { form?: string };
export type SetDefaultModelConfigInput = {
  modelConfig: ModelConfig;
  expected: readonly string[];
};

export function useSetDefaultModelConfig() {
  const queryClient = useQueryClient();
  const musterApi = useMusterPluginApi();
  const organizations = useOrganizationDirectory();
  const organizationForm = useRouteRef(organizationCredentialsRouteRef);
  const platformForm = useRouteRef(modelCredentialsRouteRef);
  const mutation = useTrackedMutation<
    SetDefaultModelConfigResult,
    Error,
    SetDefaultModelConfigInput
  >({
    event: ({ form }) =>
      form ? null : { name: 'AgentPlatform.defaultModelSet', attributes: {} },
    mutationFn: async ({ modelConfig }) => {
      if (!musterApi)
        throw new Error('agent-manager is not reachable on this installation.');
      const installation = modelConfig.cluster;
      const namespace = modelConfig.getNamespace() ?? '';
      const organization = organizations.directory.get(namespace);
      try {
        const result = await new AgentManagerClient(
          musterApi,
          installation,
        ).setOrganizationModel({
          namespace,
          name: modelConfig.getName(),
          default: true,
          requestId: crypto.randomUUID(),
        });
        const operation = preparedCredentialOperation(result);
        if (!operation) return {};
        const form = organization
          ? organizationForm?.({
              installation,
              parent: organization.parent,
              name: organization.organization,
              operation,
            })
          : platformForm?.({ installation, namespace, operation });
        if (!form)
          throw new Error(
            'This model needs a credential, but the credential form is unavailable.',
          );
        return { form };
      } finally {
        await invalidateModelReads(queryClient, installation, namespace);
      }
    },
  });
  return {
    setDefault: mutation.mutateAsync,
    isSetting: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
