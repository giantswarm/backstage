import {
  ConfigApi,
  createApiRef,
  DiscoveryApi,
  FetchApi,
} from '@backstage/core-plugin-api';
import {
  KubernetesApi,
  KubernetesAuthProvidersApi,
} from '@backstage/plugin-kubernetes-react';
import { getInstallationOidcToken } from '@giantswarm/backstage-plugin-kubernetes-react';
import { isHomeInstallation, MusterTokenMintError } from './installationToken';
import {
  AuthStatusResponse,
  FilterCapabilitiesOptions,
  FilterPromptsResponse,
  FilterResourcesResponse,
  FilterToolsOptions,
  FilterToolsResponse,
  ListExecutionsOptions,
  ListToolsResponse,
  McpServerListResponse,
  MusterApi,
  MusterAuthProvidersApi,
  MusterInstallationInfo,
  MusterInstallationsResponse,
  ServerSignInResult,
  ServerSignOutResult,
  ToolDetail,
  WorkflowExecution,
  WorkflowExecutionListResponse,
  WorkflowGetResponse,
  WorkflowListResponse,
  McpUsage,
  WorkflowStats,
} from './types';

/**
 * Serialises the shared `filter_resources` / `filter_prompts` query. `server`
 * is the meaningful scope for resources, whose scheme'd URIs carry no server
 * prefix to match a pattern against.
 */
function capabilityQuery(options: FilterCapabilitiesOptions): string {
  const searchParams = new URLSearchParams();
  if (options.server) {
    searchParams.set('server', options.server);
  }
  if (options.pattern) {
    searchParams.set('pattern', options.pattern);
  }
  if (options.limit !== undefined) {
    searchParams.set('limit', String(options.limit));
  }
  if (options.offset !== undefined) {
    searchParams.set('offset', String(options.offset));
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

export const musterApiRef = createApiRef<MusterApi>({
  id: 'plugin.muster.api',
});

/**
 * Header carrying the user's OAuth token for the muster server's
 * `authProvider`, read by the muster-backend proxy. Must match
 * MUSTER_AUTH_HEADER in plugins/muster-backend.
 */
const MUSTER_AUTH_HEADER = 'backstage-muster-authorization';

/**
 * The provider name the home path resolves the main-login token under when
 * the installation has no `authProvider` of its own (a derived installation
 * with no `muster.installations` entry): `gs.authProvider`, the person's main
 * sign-in provider, for which `MusterAuthProviders` has no dedicated MCP
 * provider and therefore answers the main ID token. Only reached when
 * `gs.authProvider` is unset as well.
 */
const MAIN_LOGIN_PROVIDER = 'main';

export class MusterApiClient implements MusterApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;
  private readonly configApi?: ConfigApi;
  private readonly authProvidersApi?: MusterAuthProvidersApi;
  private readonly kubernetesApi?: KubernetesApi;
  private readonly kubernetesAuthProvidersApi?: KubernetesAuthProvidersApi;
  /**
   * The backend's `/installations`, read once per client for the token
   * decision on installations the frontend config does not list (derived
   * ones). The list is a function of the backend's configuration, so it does
   * not change while the page lives; a failed read is not kept.
   */
  private installationsPromise?: Promise<MusterInstallationsResponse>;

  /**
   * `kubernetesApi` + `kubernetesAuthProvidersApi` mint the per-installation
   * token for musters other than the home installation (see
   * {@link isHomeInstallation}); without them every installation is reached
   * with the `authProvidersApi` token, as before.
   */
  constructor(options: {
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
    configApi?: ConfigApi;
    authProvidersApi?: MusterAuthProvidersApi;
    kubernetesApi?: KubernetesApi;
    kubernetesAuthProvidersApi?: KubernetesAuthProvidersApi;
  }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
    this.configApi = options.configApi;
    this.authProvidersApi = options.authProvidersApi;
    this.kubernetesApi = options.kubernetesApi;
    this.kubernetesAuthProvidersApi = options.kubernetesAuthProvidersApi;
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

  async getMcpUsage(
    options: { installation?: string; hours?: number } = {},
  ): Promise<McpUsage> {
    const searchParams = new URLSearchParams();
    if (options.hours !== undefined) {
      searchParams.set('hours', String(options.hours));
    }
    const query = searchParams.toString();
    return this.get<McpUsage>(
      `/usage${query ? `?${query}` : ''}`,
      options.installation,
    );
  }

  async listServers(installation?: string): Promise<McpServerListResponse> {
    return this.get<McpServerListResponse>('/servers', installation);
  }

  async filterTools(
    options: FilterToolsOptions = {},
  ): Promise<FilterToolsResponse> {
    const {
      installation,
      pattern,
      query,
      includeSchema,
      limit,
      offset,
      toolset,
      includePresets,
    } = options;
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
    // One `toolset=` entry per selector: a selector never contains a comma or
    // whitespace (the grammar forbids both), so the repeated parameter is
    // unambiguous and the backend rebuilds the list in order.
    for (const selector of toolset ?? []) {
      searchParams.append('toolset', selector);
    }
    if (includePresets !== undefined) {
      searchParams.set('include_presets', String(includePresets));
    }
    const qs = searchParams.toString();
    return this.get<FilterToolsResponse>(
      `/tools/filter${qs ? `?${qs}` : ''}`,
      installation,
    );
  }

  async filterResources(
    options: FilterCapabilitiesOptions = {},
  ): Promise<FilterResourcesResponse> {
    return this.get<FilterResourcesResponse>(
      `/resources/filter${capabilityQuery(options)}`,
      options.installation,
    );
  }

  async filterPrompts(
    options: FilterCapabilitiesOptions = {},
  ): Promise<FilterPromptsResponse> {
    return this.get<FilterPromptsResponse>(
      `/prompts/filter${capabilityQuery(options)}`,
      options.installation,
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

  async getAuthStatus(installation?: string): Promise<AuthStatusResponse> {
    return this.get<AuthStatusResponse>('/auth/status', installation);
  }

  async signInServer(
    server: string,
    installation?: string,
  ): Promise<ServerSignInResult> {
    return this.post<ServerSignInResult>(
      '/auth/login',
      { server },
      installation,
    );
  }

  async signOutServer(
    server: string,
    installation?: string,
  ): Promise<ServerSignOutResult> {
    return this.post<ServerSignOutResult>(
      '/auth/logout',
      { server },
      installation,
    );
  }

  /**
   * Resolve (and if needed mint, via the single main re-login) the token for
   * the target installation's muster, the same way every request does. Unlike
   * getAuthHeaders this reports success/failure instead of throwing, so the UI
   * can re-run the mint from a button and re-probe afterwards.
   */
  async signIn(installation?: string): Promise<boolean> {
    if (!(await this.requiresToken(installation))) {
      return true;
    }
    try {
      return Boolean(await this.resolveToken(installation));
    } catch {
      return false;
    }
  }

  /**
   * Whether the installation's muster needs the person's token, and under
   * which provider name the home path resolves it.
   *
   * A configured installation says so through its `authProvider`
   * ({@link resolveAuthProvider}). A derived installation has no entry in the
   * frontend config at all; the backend, which derived it, reports
   * `requiresAuth` on `/installations` (always true for derived entries --
   * every muster gates), and the home path then resolves the main-login token
   * under `gs.authProvider`. Which token is sent does not depend on the
   * provider name (see {@link resolveToken}).
   */
  private async requiresToken(
    installation?: string,
  ): Promise<{ authProvider: string } | undefined> {
    const configured = this.resolveAuthProvider(installation);
    if (configured) {
      return { authProvider: configured };
    }
    if (!installation) {
      return undefined;
    }
    const info = await this.backendInstallation(installation);
    if (!info?.requiresAuth) {
      return undefined;
    }
    return {
      authProvider:
        this.configApi?.getOptionalString('gs.authProvider') ??
        MAIN_LOGIN_PROVIDER,
    };
  }

  private async backendInstallation(
    name: string,
  ): Promise<MusterInstallationInfo | undefined> {
    if (!this.installationsPromise) {
      this.installationsPromise = this.listInstallations().catch(error => {
        this.installationsPromise = undefined;
        throw error;
      });
    }
    const response = await this.installationsPromise;
    return (response?.installations ?? []).find(
      installation => installation.name === name,
    );
  }

  /**
   * The muster server's `authProvider`. Resolved per installation from
   * `muster.installations[]` (the same config the muster-backend proxy reads),
   * falling back to the legacy single-installation `aiChat.mcp` entry selected
   * by `muster.serverName` (default `muster`). When set, the installation
   * requires a per-user token; which token depends on whether it is the home
   * installation (see {@link resolveToken}). A derived installation has no
   * entry here -- see {@link requiresToken}.
   */
  private resolveAuthProvider(installation?: string): string | undefined {
    if (!this.configApi) {
      return undefined;
    }
    if (installation) {
      const installations = this.configApi.getOptionalConfigArray(
        'muster.installations',
      );
      const match = installations?.find(
        i => i.getOptionalString('name') === installation,
      );
      const authProvider = match?.getOptionalString('authProvider');
      if (authProvider) {
        return authProvider;
      }
    }
    const serverName =
      this.configApi.getOptionalString('muster.serverName') ?? 'muster';
    const mcpConfigs = this.configApi.getOptionalConfigArray('aiChat.mcp');
    const mcpConfig = mcpConfigs?.find(
      mcp => mcp.getOptionalString('name') === serverName,
    );
    return mcpConfig?.getOptionalString('authProvider');
  }

  private async getAuthHeaders(
    installation?: string,
  ): Promise<Record<string, string>> {
    const token = await this.resolveToken(installation);
    return token ? { [MUSTER_AUTH_HEADER]: token } : {};
  }

  /**
   * The bearer token for the target installation's muster, or undefined when
   * the installation needs none.
   *
   * - Home installation (or no installation named): the `authProvider`'s token
   *   from `authProvidersApi` -- on the Dev Portal the person's main-login Dex
   *   ID token, which the home muster trusts.
   * - Any other installation: the token the cluster token broker mints for it,
   *   issued by that installation's own Dex (`getInstallationOidcToken`, the
   *   kagent/model-manager path). Its `authProvider` config is not consulted
   *   beyond "requires a token".
   *
   * Throws {@link MusterTokenMintError} when the token cannot be obtained, so
   * callers can tell "no token could be minted" from muster's own 401.
   */
  private async resolveToken(
    installation?: string,
  ): Promise<string | undefined> {
    const required = await this.requiresToken(installation);
    if (!required) {
      return undefined;
    }
    if (installation && !(await this.isHomeInstallation(installation))) {
      return this.mintInstallationToken(installation);
    }
    if (!this.authProvidersApi) {
      return undefined;
    }
    const { token } = await this.authProvidersApi.getCredentials(
      required.authProvider,
    );
    if (!token) {
      // The main-login token is the only source here, so its absence means the
      // portal session is gone (or the re-login was declined).
      throw new MusterTokenMintError(
        installation,
        'session-expired',
        `Your portal session has expired; no sign-in token is available for muster${
          installation ? ` on ${installation}` : ''
        }.`,
      );
    }
    return token;
  }

  /**
   * Whether `installation` is reached with the main-login token. Decided from
   * the kubernetes API's cluster entry (`oidcTokenProvider`) against the main
   * provider `gs.authProvider`; a cluster lookup that fails or a client wired
   * without the kubernetes APIs keeps the main-token path.
   */
  private async isHomeInstallation(installation: string): Promise<boolean> {
    if (!this.kubernetesApi || !this.kubernetesAuthProvidersApi) {
      return true;
    }
    const mainProvider = this.configApi?.getOptionalString('gs.authProvider');
    if (!mainProvider) {
      return true;
    }
    try {
      const cluster = await this.kubernetesApi.getCluster(installation);
      return isHomeInstallation(cluster, mainProvider);
    } catch {
      return true;
    }
  }

  private async mintInstallationToken(installation: string): Promise<string> {
    try {
      return await getInstallationOidcToken(
        this.kubernetesApi!,
        this.kubernetesAuthProvidersApi!,
        installation,
      );
    } catch (error) {
      throw MusterTokenMintError.fromMintFailure(installation, error);
    }
  }

  /**
   * GET a muster-backend route. `installation` selects the target muster when
   * several are configured (appended as `?installation=`); it is preserved
   * alongside any query string already present in `path`.
   */
  private async get<T>(path: string, installation?: string): Promise<T> {
    const url = await this.buildUrl(path, installation);
    const headers = await this.getAuthHeaders(installation);
    const response = await this.fetchApi.fetch(url, { headers });
    return this.handleResponse<T>(response);
  }

  /**
   * POST a muster-backend route. Used for actions that have side effects
   * (workflow runs, tool calls).
   */
  private async post<T>(
    path: string,
    body: unknown,
    installation?: string,
  ): Promise<T> {
    const url = await this.buildUrl(path, installation);
    const headers = {
      ...(await this.getAuthHeaders(installation)),
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
