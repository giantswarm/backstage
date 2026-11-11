import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useRouteRef } from '@backstage/frontend-plugin-api';
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

/** What a tab asks agent-manager for: a model, or a new credential value. */
export type CredentialRequest =
  | { kind: 'model'; name: string; provider: string; model: string }
  | { kind: 'model-key'; name: string }
  | { kind: 'connector-credential'; name: string };

/**
 * Asks agent-manager, as the person, for a write that needs a credential:
 * a new model, or a new key or credential value for an existing object. The
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
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const formLink = useRouteRef(organizationCredentialsRouteRef);

  const send = (request: CredentialRequest) => {
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
      case 'model-key':
        return client.setOrganizationModel({
          namespace,
          name: request.name,
          replaceCredential: true,
          requestId,
        });
      default:
        return client.setOrganizationConnector({
          namespace,
          name: request.name,
          replaceCredential: true,
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
