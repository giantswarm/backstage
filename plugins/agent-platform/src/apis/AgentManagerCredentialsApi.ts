import {
  createApiRef,
  DiscoveryApi,
  FetchApi,
} from '@backstage/core-plugin-api';
import {
  KubernetesApi,
  KubernetesAuthProvidersApi,
} from '@backstage/plugin-kubernetes-react';

import { ResponseError } from '@backstage/errors';

import { getInstallationOidcToken } from '../lib/installationOidcToken';
import type {
  CredentialOperation,
  CredentialOperationRead,
  CredentialResourceResult,
  CredentialValue,
} from '../lib/credentialOperations';

/** Header carrying the person's installation token. Must match AGENT_MANAGER_AUTH_HEADER in plugins/agent-platform-backend. */
export const AGENT_MANAGER_AUTH_HEADER =
  'backstage-agent-manager-authorization';

const PATH = '/organizations/credential-operations';

/**
 * agent-manager's code on a refused credential operation, from the portal
 * backend's error body (`ResponseError`): `precondition_failed` (the
 * confirmation changed), `conflict` and `gitops_owned` (what it writes
 * changed), `auth_required` (no GitHub grant for a commit), `not_found`
 * (gone, expired, or someone else's), `outcome_unknown` (a save that did not
 * answer in time and may still complete).
 */
export function credentialOperationErrorCode(
  error: unknown,
): string | undefined {
  if (!(error instanceof ResponseError)) {
    return undefined;
  }
  const code = error.body.error?.code;
  return typeof code === 'string' ? code : undefined;
}

/** What agent-manager (or the portal's backend) said, in its own words. */
export function credentialOperationErrorMessage(error: Error): string {
  if (error instanceof ResponseError) {
    return error.body.error?.message || error.message;
  }
  return error.message;
}

/** The HTTP status of a refused credential operation. */
export function credentialOperationErrorStatus(
  error: unknown,
): number | undefined {
  return error instanceof ResponseError ? error.statusCode : undefined;
}

export interface AgentManagerCredentialsApi {
  /** The confirmation of an operation and its ETag. */
  getOperation(
    installation: string,
    operation: string,
  ): Promise<CredentialOperationRead>;
  /** Saves the values once; agent-manager answers the receipt. */
  saveOperation(
    installation: string,
    operation: string,
    etag: string,
    values: CredentialValue[],
  ): Promise<CredentialResourceResult>;
  /** Cancels a pending operation. */
  cancelOperation(
    installation: string,
    operation: string,
    etag: string,
  ): Promise<void>;
}

export const agentManagerCredentialsApiRef =
  createApiRef<AgentManagerCredentialsApi>({
    id: 'plugin.agent-platform.agent-manager-credentials',
  });

/**
 * The credential operations through the portal's backend, with the person's
 * installation token: the same token muster forwards to agent-manager, so
 * the issuer and subject agent-manager checks are the ones that prepared the
 * operation. Values live in the request body only.
 */
export class AgentManagerCredentialsClient implements AgentManagerCredentialsApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;
  private readonly kubernetesApi: KubernetesApi;
  private readonly kubernetesAuthProvidersApi: KubernetesAuthProvidersApi;

  constructor(options: {
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
    kubernetesApi: KubernetesApi;
    kubernetesAuthProvidersApi: KubernetesAuthProvidersApi;
  }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
    this.kubernetesApi = options.kubernetesApi;
    this.kubernetesAuthProvidersApi = options.kubernetesAuthProvidersApi;
  }

  async getOperation(
    installation: string,
    operation: string,
  ): Promise<CredentialOperationRead> {
    const response = await this.request(installation, operation, {
      method: 'GET',
    });
    const etag = response.headers.get('etag') ?? '';
    const body = (await response.json()) as CredentialOperation;
    return { operation: body, etag };
  }

  async saveOperation(
    installation: string,
    operation: string,
    etag: string,
    values: CredentialValue[],
  ): Promise<CredentialResourceResult> {
    const response = await this.request(installation, operation, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'If-Match': etag },
      body: JSON.stringify({ values }),
    });
    return (await response.json()) as CredentialResourceResult;
  }

  async cancelOperation(
    installation: string,
    operation: string,
    etag: string,
  ): Promise<void> {
    await this.request(installation, operation, {
      method: 'DELETE',
      headers: { 'If-Match': etag },
    });
  }

  private async request(
    installation: string,
    operation: string,
    init: { method: string; headers?: Record<string, string>; body?: string },
  ): Promise<Response> {
    const baseUrl = await this.discoveryApi.getBaseUrl('agent-platform');
    const token = await getInstallationOidcToken(
      this.kubernetesApi,
      this.kubernetesAuthProvidersApi,
      installation,
    );
    const query = new URLSearchParams({ installation });
    const response = await this.fetchApi.fetch(
      `${baseUrl}${PATH}/${encodeURIComponent(operation)}?${query}`,
      {
        ...init,
        cache: 'no-store',
        headers: { ...init.headers, [AGENT_MANAGER_AUTH_HEADER]: token },
      },
    );
    if (!response.ok) {
      throw await ResponseError.fromResponse(response);
    }
    return response;
  }
}
