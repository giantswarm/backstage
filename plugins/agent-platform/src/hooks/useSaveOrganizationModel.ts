import { useQueryClient } from '@tanstack/react-query';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import type { ModelConfig } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import { preparedCredentialOperation } from '../lib/credentialOperations';
import type { ModelConfigFormValues } from '../lib/modelConfigs';
import type { OrganizationNamespace } from '../lib/organizations';
import { organizationCredentialsRouteRef } from '../routes';
import { credentialRequestErrorMessage } from '../lib/credentialRequestErrors';
import { invalidateModelReads } from './defaultModelWrites';
import { modelKeyReference } from './modelKeyReference';
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
   * request, and its write finishes when the person saves the key there.
   * Absent when the write is finished.
   */
  form?: string;
  /** Whether the organization's default model is this one after the write. */
  isDefault: boolean;
  /** Edit only: the model's change is written (before any new key). */
  changed?: boolean;
};

/**
 * Creates or changes a model of an organization, as the person. The portal
 * writes no Secret and sends no key; the key is entered on the portal's
 * credential form, which agent-manager's credential request leads to.
 *
 * - A create is `set_organization_model`; its key is missing, so the
 *   answer is a credential request. It first reads the organization's
 *   models, since the tool changes a model that exists instead of refusing.
 * - An edit's change of the model id is `set_organization_model`, finished
 *   when the call answers (it prepares a request only when the key Secret
 *   is missing).
 * - A new key is `replace_organization_credential` on the Secret and key the
 *   model reads: it writes the Secret only, for every object that reads it.
 *   With a change too, the change is written first, then the key asked for.
 *
 * The provider of an existing model does not change here: the stored key is
 * the old provider's, and agent-manager cannot write a new provider and its
 * new key in one step, so either order leaves the model on a key of the
 * wrong provider for a while.
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
    // credential form's save. An edit's change is written here.
    event: ({ form, changed }, { original }) => {
      if (original) {
        return changed
          ? { name: 'AgentPlatform.modelUpdated', attributes: {} }
          : null;
      }
      return form
        ? null
        : { name: 'AgentPlatform.modelCreated', attributes: {} };
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
      const formOf = (operation: string) => {
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
        return form;
      };
      const { namespace } = organization;

      if (!original) {
        const name = values.name.trim();
        // set_organization_model changes a model that exists: a create
        // must not land on one. Read fresh, as the person; agent-manager
        // has no create-only write, so a model made in between still wins.
        const existing = await client.listModelConfigs(namespace);
        if (existing.some(model => model.name === name)) {
          throw new Error(
            `The organization ${organization.organization} already has a model named ${name}. Choose another name, or edit that model.`,
          );
        }
        const result = await client.setOrganizationModel({
          namespace,
          name,
          provider: values.provider,
          model: values.model.trim(),
          ...(makeDefault ? { default: true } : {}),
          requestId: crypto.randomUUID(),
        });
        const operation = preparedCredentialOperation(result);
        return {
          isDefault: result.defaultModel === name,
          ...(operation ? { form: formOf(operation) } : {}),
        };
      }

      const name = original.getName();
      if (values.provider !== original.getProvider()) {
        throw new Error(
          'An organization’s model keeps its provider: its key is the provider’s. Add a model for the other provider instead.',
        );
      }
      const model = values.model.trim();
      let changed = false;
      let isDefault = false;
      if (model !== (original.getModel() ?? '')) {
        const result = await client.setOrganizationModel({
          namespace,
          name,
          provider: values.provider,
          model,
          requestId: crypto.randomUUID(),
        });
        isDefault = result.defaultModel === name;
        const operation = preparedCredentialOperation(result);
        if (operation) {
          // The key Secret is missing: the request asks for the key and
          // writes the change with it.
          return { isDefault, form: formOf(operation) };
        }
        changed = true;
      }
      if (!replaceKey) {
        return { isDefault, changed };
      }
      try {
        const { secret, key } = modelKeyReference(original);
        const result = await client.replaceOrganizationCredential({
          namespace,
          secret,
          key,
          requestId: crypto.randomUUID(),
        });
        const operation = preparedCredentialOperation(result);
        if (!operation) {
          throw new Error(
            'agent-manager answered the new key request without a credential request.',
          );
        }
        return { isDefault, changed, form: formOf(operation) };
      } catch (error) {
        const why = credentialRequestErrorMessage(error as Error);
        if (!changed) {
          throw new Error(why, { cause: error });
        }
        await invalidateModelReads(queryClient, installation, namespace);
        throw new Error(
          `The model change is saved, but the new key could not be asked for. ${why}`,
          { cause: error },
        );
      }
    },
    onSuccess: ({ form, changed }, { organization, original }) => {
      // Invalidate rather than edit the cache: the QueryClient is persisted.
      // A request still to be finished on the form is reread there.
      const wrote = original ? changed : !form;
      if (!installation || !wrote) {
        return undefined;
      }
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
