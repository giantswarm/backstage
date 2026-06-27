import {
  ConfigApi,
  createApiRef,
  DiscoveryApi,
  FetchApi,
} from '@backstage/core-plugin-api';
import {
  FilterToolsOptions,
  FilterToolsResponse,
  ListExecutionsOptions,
  ListToolsResponse,
  McpServerListResponse,
  MusterApi,
  MusterAuthProvidersApi,
  MusterInstallationsResponse,
  ToolDetail,
  WorkflowExecution,
  WorkflowExecutionListResponse,
  WorkflowGetResponse,
  WorkflowListResponse,
  WorkflowStats,
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

  async listInstallations(): Promise<MusterInstallationsResponse> {
    return this.get<MusterInstallationsResponse>('/installations');
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
      options.installation,
    );
  }

  async getExecution(
    executionId: string,
    installation?: string,
  ): Promise<WorkflowExecution> {
    return this.get<WorkflowExecution>(
      `/executions/${encodeURIComponent(executionId)}`,
      installation,
    );
  }

  async getWorkflowStats(
    name: string,
    installation?: string,
  ): Promise<WorkflowStats> {
    return this.get<WorkflowStats>(
      `/workflows/${encodeURIComponent(name)}/stats`,
      installation,
    );
  }

  async runWorkflow(
    name: string,
    args: Record<string, unknown>,
    installation?: string,
  ): Promise<unknown> {
    return this.post<unknown>(
      `/workflows/${encodeURIComponent(name)}/run`,
      { arguments: args },
      installation,
    );
  }

  async listServers(installation?: string): Promise<McpServerListResponse> {
    return this.get<McpServerListResponse>('/servers', installation);
  }

  async filterTools(
    options: FilterToolsOptions = {},
  ): Promise<FilterToolsResponse> {
    const { installation, pattern, query, includeSchema, limit, offset } =
      options;
    const searchParams = new URLSearchParams();
    if (pattern) {
      searchParams.set('pattern', pattern);
    }
    if (query) {
      searchParams.set('query', query);
    }
    if (includeSchema !== undefined) {
      searchParams.set('include_schema', String(includeSchema));
    }
    if (limit !== undefined) {
      searchParams.set('limit', String(limit));
    }
    if (offset !== undefined) {
      searchParams.set('offset', String(offset));
    }
    const qs = searchParams.toString();
    return this.get<FilterToolsResponse>(
      `/tools/filter${qs ? `?${qs}` : ''}`,
      installation,
    );
  }

  async listTools(installation?: string): Promise<ListToolsResponse> {
    return this.get<ListToolsResponse>('/tools', installation);
  }

  async listCoreTools(installation?: string): Promise<FilterToolsResponse> {
    return this.get<FilterToolsResponse>(
      '/core-tools?include_schema=true',
      installation,
    );
  }

  async describeTool(name: string, installation?: string): Promise<ToolDetail> {
    return this.get<ToolDetail>(
      `/tools/${encodeURIComponent(name)}`,
      installation,
    );
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    installation?: string,
  ): Promise<unknown> {
    return this.post<unknown>('/call', { name, arguments: args }, installation);
  }

  /**
   * Resolve (and if needed mint, via the OAuth popup) a token for the muster
   * auth provider. Unlike getAuthHeaders this surfaces success/failure so the
   * UI can report whether sign-in worked.
   */
  async signIn(): Promise<boolean> {
    const authProvider = this.resolveAuthProvider();
    if (!authProvider) {
      return true;
    }
    if (!this.authProvidersApi) {
      return false;
    }
    const credentials =
      await this.authProvidersApi.getCredentials(authProvider);
    return Boolean(credentials.token);
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
    const credentials =
      await this.authProvidersApi.getCredentials(authProvider);
    if (!credentials.token) {
      return {};
    }
    return { [MUSTER_AUTH_HEADER]: credentials.token };
  }

  /**
   * GET a muster-backend route. `installation` selects the target muster when
   * several are configured (appended as `?installation=`); it is preserved
   * alongside any query string already present in `path`.
   */
  private async get<T>(path: string, installation?: string): Promise<T> {
    const url = await this.buildUrl(path, installation);
    const headers = await this.getAuthHeaders();
    const response = await this.fetchApi.fetch(url, { headers });
    return this.handleResponse<T>(response);
  }

  /**
   * POST a muster-backend route. Used for mutating actions (workflow runs,
   * tool calls); the proxy enforces the read-only/mutation gate server-side.
   */
  private async post<T>(
    path: string,
    body: unknown,
    installation?: string,
  ): Promise<T> {
    const url = await this.buildUrl(path, installation);
    const headers = {
      ...(await this.getAuthHeaders()),
      'Content-Type': 'application/json',
    };
    const response = await this.fetchApi.fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response);
  }

  private async buildUrl(path: string, installation?: string): Promise<string> {
    const baseUrl = await this.discoveryApi.getBaseUrl('muster');
    const url = new URL(`${baseUrl}${path}`);
    if (installation) {
      url.searchParams.set('installation', installation);
    }
    return url.toString();
  }

  private async handleResponse<T>(response: Response): Promise<T> {
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
