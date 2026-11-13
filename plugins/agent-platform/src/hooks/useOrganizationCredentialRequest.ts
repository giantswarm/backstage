import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useApi } from '@backstage/core-plugin-api';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { kubernetesApiRef } from '@backstage/plugin-kubernetes-react';
import { useTrackedMutation } from '@giantswarm/backstage-plugin-analytics-react';

import {
  type CredentialResourceResult,
  preparedCredentialOperation,
} from '../lib/credentialOperations';
import type { OrganizationNamespace } from '../lib/organizations';
import {
  musterAgentManagerModelConfigsQueryKey,
  musterOrganizationConnectorsQueryKey,
} from '../lib/queryKeys';
import { organizationCredentialsRouteRef } from '../routes';
import { useAgentManagerClient } from './useAgentManager';
import { readModelKeyReference } from './modelKeyReference';

/**
 * What a tab asks agent-manager for: a model, a new key for a model (its
 * Secret and key read from the model first), or a new value for one key of a
 * credential Secret (a connector's, as `list_organization_connectors` names
 * it).
 */
export type CredentialRequest =
  | { kind: 'model'; name: string; provider: string; model: string }
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
  const kubernetesApi = useApi(kubernetesApiRef);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const formLink = useRouteRef(organizationCredentialsRouteRef);

  const send = async (request: CredentialRequest) => {
    if (!client) {
      throw new Error('agent-manager is not reachable on this installation.');
    }
    const { namespace } = organization;
    const requestId = crypto.randomUUID();
    switch (request.kind) {
      case 'model':
        return client.setOrganizationModel({
          namespace,
          name: request.name,
          provider: request.provider,
          model: request.model,
          requestId,
        });
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
    event: null,
    untrackedReason:
      'prepares a credential request; the save on the credential form is the tracked write',
    mutationFn: async request => {
      const result = await send(request);
      const operation = preparedCredentialOperation(result);
      if (!operation) {
        return { result };
      }
      const form = formLink?.({
        installation,
        parent: organization.parent,
        name: organization.organization,
        operation,
      });
      return { result, form };
    },
    onSuccess: ({ form }) => {
      if (form) {
        navigate(form);
        return undefined;
      }
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
