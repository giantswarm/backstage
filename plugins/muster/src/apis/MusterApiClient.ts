import {
  ConfigApi,
  createApiRef,
  DiscoveryApi,
  FetchApi,
} from '@backstage/core-plugin-api';
import {
  ListExecutionsOptions,
  MusterApi,
  MusterAuthProvidersApi,
  WorkflowExecution,
  WorkflowExecutionListResponse,
  WorkflowGetResponse,
  WorkflowListResponse,
} from './types';

export const musterApiRef = createApiRef<MusterApi>({
  id: 'plugin.muster.api',
});

/**
 * Header carrying the user's OAuth token for the muster server's
 * `authProvider`, read by the muster-backend proxy. Must match
 * MUSTER_AUTH_HEADER in plugins/muster-backend.
 */
const MUSTER_AUTH_HEADER = 'backstage-muster-authorization';

export class MusterApiClient implements MusterApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;
  private readonly configApi?: ConfigApi;
  private readonly authProvidersApi?: MusterAuthProvidersApi;

  constructor(options: {
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
    configApi?: ConfigApi;
    authProvidersApi?: MusterAuthProvidersApi;
  }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
    this.configApi = options.configApi;
    this.authProvidersApi = options.authProvidersApi;
  }

  async listWorkflows(): Promise<WorkflowListResponse> {
    return this.get<WorkflowListResponse>('/workflows');
  }

  async getWorkflow(name: string): Promise<WorkflowGetResponse> {
    return this.get<WorkflowGetResponse>(
      `/workflows/${encodeURIComponent(name)}`,
    );
  }

  async listExecutions(
    options: ListExecutionsOptions = {},
  ): Promise<WorkflowExecutionListResponse> {
    const searchParams = new URLSearchParams();
    if (options.workflowName) {
      searchParams.set('workflow_name', options.workflowName);
    }
    if (options.status) {
      searchParams.set('status', options.status);
    }
    if (options.limit !== undefined) {
      searchParams.set('limit', String(options.limit));
    }
    if (options.offset !== undefined) {
      searchParams.set('offset', String(options.offset));
    }
    const query = searchParams.toString();
    return this.get<WorkflowExecutionListResponse>(
      `/executions${query ? `?${query}` : ''}`,
    );
  }

  async getExecution(executionId: string): Promise<WorkflowExecution> {
    return this.get<WorkflowExecution>(
      `/executions/${encodeURIComponent(executionId)}`,
    );
  }

  /**
   * The muster server's `authProvider` from the `aiChat.mcp` entry selected
   * by `muster.serverName` (default `muster`) -- the same resolution the
   * muster-backend proxy applies. When set, requests carry the user's OAuth
   * token for that provider.
   */
  private resolveAuthProvider(): string | undefined {
    if (!this.configApi) {
      return undefined;
    }
    const serverName =
      this.configApi.getOptionalString('muster.serverName') ?? 'muster';
    const mcpConfigs = this.configApi.getOptionalConfigArray('aiChat.mcp');
    const mcpConfig = mcpConfigs?.find(
      mcp => mcp.getOptionalString('name') === serverName,
    );
    return mcpConfig?.getOptionalString('authProvider');
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const authProvider = this.resolveAuthProvider();
    if (!authProvider || !this.authProvidersApi) {
      return {};
    }
    const credentials = await this.authProvidersApi.getCredentials(
      authProvider,
    );
    if (!credentials.token) {
      return {};
    }
    return { [MUSTER_AUTH_HEADER]: credentials.token };
  }

  private async get<T>(path: string): Promise<T> {
    const baseUrl = await this.discoveryApi.getBaseUrl('muster');
    const headers = await this.getAuthHeaders();
    const response = await this.fetchApi.fetch(`${baseUrl}${path}`, {
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message =
        (errorData as { error?: { message?: string } })?.error?.message ??
        `Muster request failed with status ${response.status}`;
      const error = new Error(message);
      if (response.status === 401) error.name = 'UnauthorizedError';
      if (response.status === 403) error.name = 'ForbiddenError';
      if (response.status === 404) error.name = 'NotFoundError';
      if (response.status === 503) error.name = 'ServiceUnavailableError';
      throw error;
    }

    return response.json() as Promise<T>;
  }
}
