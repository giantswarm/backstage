import { useQueryClient } from '@tanstack/react-query';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import type { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import { preparedCredentialOperation } from '../lib/credentialOperations';
import type { ModelConfigFormValues } from '../lib/modelConfigs';
import type { OrganizationNamespace } from '../lib/organizations';
import { organizationCredentialsRouteRef } from '../routes';
import { invalidateModelReads } from './defaultModelWrites';
import { useAgentManagerClient } from './useAgentManager';

export type SaveOrganizationModelInput = {
  /** The organization namespace the model is in, or goes to. */
  organization: OrganizationNamespace;
  values: ModelConfigFormValues;
  /** The model being edited; absent for a create. */
  original?: ModelConfig;
  /** Create only: move the organization's default mark to the new model. */
  makeDefault?: boolean;
  /** Edit only: ask for a new key on the credential form. */
  replaceKey?: boolean;
};

export type SaveOrganizationModelResult = {
  /**
   * The credential form to open: agent-manager prepared a credential
   * request, and the model is written when the person saves the key there.
   * Absent when the write is finished.
   */
  form?: string;
  /** Whether the organization's default model is this one after the write. */
  isDefault: boolean;
};

/**
 * Creates or changes a model of an organization through agent-manager's
 * `set_organization_model`, as the person. The portal writes no Secret and
 * sends no key: a key that is missing (a new model) or that the person asks
 * to replace is a credential request agent-manager prepares, and its id
 * leads to the portal's credential form, which takes the key and finishes
 * the write. An edit that keeps the key is finished when the call answers.
 *
 * A create first reads the organization's models, since the tool changes a
 * model that exists instead of refusing it.
 *
 * The tool sets the provider, the model id and the default mark only; the
 * other fields of the form do not apply to an organization's model (its
 * endpoint is the platform's LLM gateway).
 */
export function useSaveOrganizationModel(installation: string | undefined) {
  const client = useAgentManagerClient(installation);
  const queryClient = useQueryClient();
  const formLink = useRouteRef(organizationCredentialsRouteRef);

  const mutation = useTrackedMutation<
    SaveOrganizationModelResult,
    Error,
    SaveOrganizationModelInput
  >({
    // A write that waits for its key is tracked where it is finished: the
    // credential form's save.
    event: ({ form }, { original }) => {
      if (form) {
        return null;
      }
      return {
        name: original
          ? 'AgentPlatform.modelUpdated'
          : 'AgentPlatform.modelCreated',
        attributes: {},
      };
    },
    mutationFn: async ({
      organization,
      values,
      original,
      makeDefault = false,
      replaceKey = false,
    }) => {
      if (!client || !installation) {
        throw new Error(
          'agent-manager is not reachable on this installation, and an organization’s model is saved through it.',
        );
      }
      const name = original?.getName() ?? values.name.trim();
      if (!original) {
        // set_organization_model changes a model that exists: a create
        // must not land on one. Read fresh, as the person; agent-manager
        // has no create-only write, so a model made in between still wins.
        const existing = await client.listModelConfigs(organization.namespace);
        if (existing.some(model => model.name === name)) {
          throw new Error(
            `The organization ${organization.organization} already has a model named ${name}. Choose another name, or edit that model.`,
          );
        }
      }
      const result = await client.setOrganizationModel({
        namespace: organization.namespace,
        name,
        provider: values.provider,
        model: values.model.trim(),
        ...(!original && makeDefault ? { default: true } : {}),
        ...(original && replaceKey ? { replaceCredential: true } : {}),
        requestId: crypto.randomUUID(),
      });
      const operation = preparedCredentialOperation(result);
      const isDefault = result.defaultModel === name;
      if (!operation) {
        return { isDefault };
      }
      const form = formLink?.({
        installation,
        parent: organization.parent,
        name: organization.organization,
        operation,
      });
      if (!form) {
        throw new Error(
          'The key is entered on the credential form, and this portal has none.',
        );
      }
      return { form, isDefault };
    },
    onSuccess: ({ form }, { organization }) => {
      if (form || !installation) {
        return undefined;
      }
      // Invalidate rather than edit the cache: the QueryClient is persisted.
      return invalidateModelReads(
        queryClient,
        installation,
        organization.namespace,
      );
    },
  });

  return {
    save: mutation.mutateAsync,
    isSaving: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
