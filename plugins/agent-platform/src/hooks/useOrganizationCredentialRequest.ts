import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useApi } from '@backstage/core-plugin-api';
import { toastApiRef, useRouteRef } from '@backstage/frontend-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import {
  credentialFormOf,
  type CredentialResourceResult,
  preparedCredentialOperation,
} from '../lib/credentialOperations';
import { AgentManagerError } from '../lib/agentManager';
import {
  modelNameTakenMessage,
  type OrganizationNamespace,
} from '../lib/organizations';
import {
  musterAgentManagerModelConfigsQueryKey,
  musterOrganizationConnectorsQueryKey,
} from '../lib/queryKeys';
import {
  modelCredentialsRouteRef,
  organizationCredentialsRouteRef,
} from '../routes';
import { useAgentManagerClient } from './useAgentManager';
import { useEnsureModelOperations } from './useEnsureModelOperations';
import { readModelKeyReference } from './modelKeyReference';
import {
  modelSettingRefusal,
  type ModelSettingsValues,
  newModelSettingsArguments,
} from '../lib/modelSettings';

/**
 * What a tab asks agent-manager for: a model, a new key for a model (its
 * Secret and key read from the model first), or a new value for one key of a
 * credential Secret (a connector's, as `list_organization_connectors` names
 * it).
 */
export type CredentialRequest =
  | {
      kind: 'model';
      name: string;
      displayName: string;
      provider: string;
      model: string;
      /**
       * The settings the dialog offered (token limit, prompt caching); sent
       * only where the installation's tool takes them.
       */
      settings?: ModelSettingsValues;
    }
  | { kind: 'model-key'; name: string }
  | { kind: 'credential'; secret: string; key: string };

/**
 * Asks agent-manager, as the person, for a write that needs a credential:
 * a new model (`set_organization_model`), or a new key or credential value
 * for an existing object (`replace_organization_credential`, which writes the
 * Secret only, never the object). The
 * tool takes no value; it prepares a credential request and answers its id
 * (`credentialOperation`), and the person is taken to the portal's own form
 * for that id. agent-manager's own link (`credentials[].formUrl`) is never
 * followed. An answer without a request (the credential already exists) is
 * a finished write: the lists are read again.
 */
export function useOrganizationCredentialRequest(
  installation: string,
  organization: OrganizationNamespace,
) {
  const client = useAgentManagerClient(installation);
  const ensureModelOperations = useEnsureModelOperations();
  const kubernetesApi = useApi(kubernetesApiRef);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const formLink = useRouteRef(organizationCredentialsRouteRef);
  const modelFormLink = useRouteRef(modelCredentialsRouteRef);
  const toastApi = useApi(toastApiRef);

  const send = async (request: CredentialRequest) => {
    if (!client) {
      throw new Error('agent-manager is not reachable on this installation.');
    }
    const { namespace } = organization;
    const requestId = crypto.randomUUID();
    switch (request.kind) {
      case 'model': {
        const { createOnly, settings } =
          await ensureModelOperations(installation);
        try {
          return await client.setOrganizationModel({
            namespace,
            name: request.name,
            displayName: request.displayName,
            provider: request.provider,
            model: request.model,
            // A new model: a model of that name is refused, not changed,
            // where the tool takes it (an older agent-manager refuses it).
            ...(createOnly ? { create: true } : {}),
            ...(settings && request.settings
              ? newModelSettingsArguments(request.provider, request.settings)
              : {}),
            requestId,
          });
        } catch (error) {
          if (
            error instanceof AgentManagerError &&
            error.code === 'already_exists'
          ) {
            throw new Error(modelNameTakenMessage(namespace, request.name), {
              cause: error,
            });
          }
          const refusal = modelSettingRefusal(error, request.provider);
          if (refusal) throw refusal;
          throw error;
        }
      }
      case 'model-key': {
        // A rotation writes the Secret only: the model is not sent again.
        const { secret, key } = await readModelKeyReference({
          kubernetesApi,
          installation,
          namespace,
          name: request.name,
        });
        return client.replaceOrganizationCredential({
          namespace,
          secret,
          key,
          requestId,
        });
      }
      default:
        return client.replaceOrganizationCredential({
          namespace,
          secret: request.secret,
          key: request.key,
          requestId,
        });
    }
  };

  return useTrackedMutation<
    { result: CredentialResourceResult; form?: string },
    Error,
    CredentialRequest
  >({
    event: ({ result, form }, request) =>
      request.kind === 'model' && !form
        ? {
            name:
              result.created === false
                ? 'AgentPlatform.modelUpdated'
                : 'AgentPlatform.modelCreated',
            attributes: {},
          }
        : null,
    mutationFn: async request => {
      const result = await send(request);
      const operation = preparedCredentialOperation(result);
      if (!operation) {
        return { result };
      }
      // A model's request opens where every model's does, wherever it was
      // started; a connector's stays under its organization.
      const unavailable =
        'The credential form is not configured. Ask the portal administrator to enable the organization credential route, then start again.';
      const form =
        request.kind === 'credential'
          ? credentialFormOf(
              formLink,
              {
                installation,
                parent: organization.parent,
                name: organization.organization,
                operation,
              },
              unavailable,
            )
          : credentialFormOf(
              modelFormLink,
              {
                installation,
                namespace: organization.namespace,
                operation,
              },
              unavailable,
            );
      return { result, form };
    },
    onSuccess: ({ form }) => {
      if (form) {
        navigate(form);
        return undefined;
      }
      toastApi.post({
        title: 'Credential request completed',
        status: 'success',
        timeout: 5000,
      });
      return Promise.all([
        queryClient.invalidateQueries({
          queryKey: musterAgentManagerModelConfigsQueryKey(
            installation,
            organization.namespace,
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: musterOrganizationConnectorsQueryKey(
            installation,
            organization.namespace,
          ),
        }),
      ]);
    },
  });
}
