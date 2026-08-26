/**
 * Types mirroring the muster workflow data model
 * (giantswarm/muster internal/api), as returned by the muster-backend
 * REST proxy.
 */

export interface WorkflowArgDefinition {
  type: string;
  required?: boolean;
  description?: string;
  default?: unknown;
}

export interface WorkflowConditionExpectation {
  success?: boolean;
  json_path?: Record<string, unknown>;
}

export interface WorkflowCondition {
  tool?: string;
  args?: Record<string, unknown>;
  from_step?: string;
  expect?: WorkflowConditionExpectation;
  expect_not?: WorkflowConditionExpectation;
}

export interface WorkflowStep {
  id: string;
  tool: string;
  args?: Record<string, unknown>;
  condition?: WorkflowCondition;
  allow_failure?: boolean;
  outputs?: Record<string, unknown>;
  store?: boolean;
  description?: string;
}

export interface Workflow {
  name: string;
  description?: string;
  args?: Record<string, WorkflowArgDefinition>;
  steps: WorkflowStep[];
  available?: boolean;
  createdAt?: string;
  lastModified?: string;
}

export interface WorkflowListItem {
  name: string;
  description?: string;
  available?: boolean;
}

export interface WorkflowListResponse {
  workflows: WorkflowListItem[] | null;
}

export interface WorkflowGetResponse {
  workflow: Workflow;
  yaml?: string;
}

/** Execution status reported by muster; steps additionally use `skipped`. */
export type WorkflowExecutionStatus =
  'inprogress' | 'completed' | 'failed' | 'skipped';

export interface WorkflowExecutionStep {
  step_id: string;
  tool: string;
  status: WorkflowExecutionStatus;
  started_at: string;
  completed_at?: string;
  duration_ms: number;
  input?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  stored_as?: string;
}

export interface WorkflowExecution {
  execution_id: string;
  workflow_name: string;
  status: WorkflowExecutionStatus;
  started_at: string;
  completed_at?: string;
  duration_ms: number;
  input?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  steps?: WorkflowExecutionStep[];
}

export interface WorkflowExecutionSummary {
  execution_id: string;
  workflow_name: string;
  status: WorkflowExecutionStatus;
  started_at: string;
  completed_at?: string;
  duration_ms: number;
  step_count: number;
  error?: string;
}

export interface WorkflowExecutionListResponse {
  executions: WorkflowExecutionSummary[] | null;
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface ListExecutionsOptions {
  workflowName?: string;
  status?: 'inprogress' | 'completed' | 'failed';
  limit?: number;
  offset?: number;
  /** Target muster installation; required when several are configured. */
  installation?: string;
}

export interface WorkflowStatsPerDay {
  date: string;
  completed: number;
  failed: number;
}

/**
 * Derived run statistics for a workflow, computed by the muster-backend over a
 * bounded sample of executions (`/workflows/:name/stats`). `runs` is muster's
 * authoritative total; rates and durations are over the sampled page only.
 */
export interface WorkflowStats {
  workflow_name: string;
  runs: number;
  sampled: number;
  completed: number;
  failed: number;
  inprogress: number;
  success_rate: number | null;
  avg_duration_ms: number | null;
  max_duration_ms: number | null;
  per_day: WorkflowStatsPerDay[];
}

/** One configured muster installation, as reported by `/installations`. */
export interface MusterInstallationInfo {
  name: string;
  /** The aggregator's MCP endpoint URL (mono-rendered on the dashboard). */
  endpoint?: string;
  requiresAuth: boolean;
}

export interface MusterInstallationsResponse {
  installations: MusterInstallationInfo[];
}

/**
 * Live runtime view of an aggregated MCP server, as returned by muster's
 * `core_mcpserver_list` (api.MCPServerInfo). Complements the CRD's `spec`/
 * `status` with the aggregator's current, session-scoped state -- the same
 * server can read `Auth Required` in the CRD while the live session reports
 * `authenticated`. Only the fields the manager surfaces are typed here.
 */
export interface McpServerRuntime {
  name: string;
  type?: string;
  state?: string;
  statusMessage?: string;
  error?: string;
  consecutiveFailures?: number;
  lastAttempt?: string;
  nextRetryAfter?: string;
  connectedAt?: string;
  sessionStatus?: string;
  sessionAuth?: string;
  toolsCount?: number;
  /**
   * The authenticated subject that registered this server through muster
   * (`ui.giantswarm.io/registered-by`, stamped server-side on create --
   * muster#1021). Empty for GitOps-managed servers.
   */
  registeredBy?: string;
  /**
   * The email claim of the identity that registered this server
   * (`ui.giantswarm.io/registered-by-email`, stamped since muster v1.8.0 --
   * muster#1050). Servers registered earlier only carry `registeredBy`.
   */
  registeredByEmail?: string;
}

export interface McpServerListResponse {
  mcpServers: McpServerRuntime[] | null;
}

/**
 * One entry from the `filter_tools` discovery tier. In discovery mode only
 * `summary` (a one-line excerpt) is populated; `description`/`inputSchema`
 * arrive with `include_schema=true` or via `describe_tool`. `score` is set
 * only for query-ranked results.
 */
export interface ToolSummary {
  name: string;
  summary?: string;
  description?: string;
  score?: number;
  labels?: Record<string, string>;
  inputSchema?: JsonSchema;
}

export interface FilterToolsResponse {
  total: number;
  filtered_count: number;
  truncated: boolean;
  tools: ToolSummary[] | null;
}

export interface FilterToolsOptions {
  installation?: string;
  pattern?: string;
  query?: string;
  includeSchema?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Minimal JSON Schema shape the tool explorer drives a form from. muster
 * returns the MCP tool's `inputSchema` verbatim (mcp.ToolInputSchema), so only
 * the object-level fields the form reads are typed; anything else is preserved
 * as opaque `JsonSchema`.
 */
export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  description?: string;
  default?: unknown;
  enum?: unknown[];
  items?: JsonSchema;
  [key: string]: unknown;
}

/** Full tool detail from `describe_tool` (FormatToolDetailJSON). */
export interface ToolDetail {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
}

/** A server the aggregator cannot use until the caller authenticates. */
export interface ServerRequiringAuth {
  name: string;
  status: string;
  auth_tool: string;
}

/** Response from the `list_tools` meta-tool (FormatToolsListWithAuthJSON). */
export interface ListToolsResponse {
  tools: ToolSummary[] | null;
  servers_requiring_auth?: ServerRequiringAuth[];
}

/** Arguments for executing an aggregated tool via the guarded `/call` route. */
export interface CallToolOptions {
  installation?: string;
}

/**
 * Per-session authentication state of one aggregated server, from muster's
 * `auth://status` resource (pkgoauth.ServerAuthStatus). Unlike the CRD's
 * `.status` this is scoped to the calling user's muster session.
 */
export interface ServerAuthStatus {
  name: string;
  status:
    | 'connected'
    | 'auth_required'
    | 'reauth_required'
    | 'sso_pending'
    | 'disconnected'
    | 'unreachable'
    | 'failed'
    | 'error';
  issuer?: string;
  scope?: string;
  /**
   * `core_auth_login` when the user can sign in themselves; absent for
   * SSO-managed servers, where only an administrator can fix the connection.
   */
  auth_tool?: string;
  error?: string;
  token_forwarding_enabled?: boolean;
  token_exchange_enabled?: boolean;
  sso_attempt_failed?: boolean;
}

export interface AuthStatusResponse {
  servers: ServerAuthStatus[];
  /**
   * Set when muster's `auth://status` could not be read at all (unsupported,
   * unreachable, mid-outage). The proxy answers 200 either way so polling it
   * doesn't flood Sentry, so this flag is the only way to tell "nothing needs a
   * sign-in" from "we cannot tell".
   */
  unavailable?: boolean;
  /** Why the status is unavailable, for display next to a waiting sign-in. */
  message?: string;
}

/**
 * Outcome of a `core_auth_login` attempt, normalised by the muster-backend.
 * `auth_required` carries the sign-in URL the user has to open; `unknown` means
 * muster answered something unrecognised and `auth://status` should be re-read.
 */
export interface ServerSignInResult {
  status: 'connected' | 'auth_required' | 'error' | 'unknown';
  authUrl?: string;
  message: string;
  /**
   * How muster identifies itself to the server's authorization server, on
   * `auth_required` challenges from musters that report it (muster#1083):
   * `cimd` — the AS accepts muster's CIMD URL as client_id; `dcr` — muster
   * registered itself via RFC 7591 Dynamic Client Registration;
   * `cimd-fallback` — the AS advertises neither mechanism and may reject the
   * sign-in with a client-not-registered error.
   */
  clientIdMethod?: 'cimd' | 'dcr' | 'cimd-fallback';
}

export interface MusterApi {
  /** The muster installations the proxy can target. */
  listInstallations(): Promise<MusterInstallationsResponse>;
  listWorkflows(): Promise<WorkflowListResponse>;
  getWorkflow(name: string): Promise<WorkflowGetResponse>;
  listExecutions(
    options?: ListExecutionsOptions,
  ): Promise<WorkflowExecutionListResponse>;
  getExecution(
    executionId: string,
    installation?: string,
  ): Promise<WorkflowExecution>;
  /** Derived run statistics for a workflow (one installation). */
  getWorkflowStats(name: string, installation?: string): Promise<WorkflowStats>;
  /** Live runtime server list from the muster aggregator (one installation). */
  listServers(installation?: string): Promise<McpServerListResponse>;
  /** Browse/search the aggregated tool catalogue of one installation. */
  filterTools(options?: FilterToolsOptions): Promise<FilterToolsResponse>;
  /**
   * The aggregated tool list plus the servers that still require auth, from the
   * `list_tools` meta-tool (one installation).
   */
  listTools(installation?: string): Promise<ListToolsResponse>;
  /** muster's own core_* tools, with input schemas (one installation). */
  listCoreTools(installation?: string): Promise<FilterToolsResponse>;
  /** Full description + input schema for one tool (one installation). */
  describeTool(name: string, installation?: string): Promise<ToolDetail>;
  /**
   * Execute an aggregated tool. The UI executes whatever tools muster exposes;
   * the trust boundary is the downstream MCP server's deployment (e.g.
   * mcp-kubernetes is deployed read-only), not the portal.
   */
  callTool(
    name: string,
    args: Record<string, unknown>,
    installation?: string,
  ): Promise<unknown>;
  /**
   * Ensure a per-user token for the target installation's muster `authProvider`
   * is available, triggering the OAuth/Dex popup if needed. Returns true when a
   * token was obtained (or no provider is configured).
   *
   * This authenticates the user to *muster itself*. It has no effect on the
   * aggregated servers muster reports in `servers_requiring_auth`, which each
   * need their own downstream OAuth flow -- see `signInServer`.
   */
  signIn(installation?: string): Promise<boolean>;
  /**
   * Per-server authentication state for the user's muster session
   * (`auth://status`). Cheap enough to poll while a sign-in is in flight.
   */
  getAuthStatus(installation?: string): Promise<AuthStatusResponse>;
  /**
   * Start the downstream OAuth flow for one aggregated server via muster's
   * `core_auth_login`. Either reports the server as already connected or
   * returns a sign-in URL the user must open in a browser; muster connects the
   * server for this session once the flow completes.
   */
  signInServer(
    server: string,
    installation?: string,
  ): Promise<ServerSignInResult>;
}

export interface MusterAuthCredentials {
  token?: string;
}

/**
 * Resolves per-user OAuth credentials for the muster MCP server's
 * `authProvider` (same semantics as ai-chat's MCPAuthProvidersApi). The
 * default implementation knows no providers; the app overrides it with the
 * gs auth providers.
 */
export interface MusterAuthProvidersApi {
  getCredentials(authProvider: string): Promise<MusterAuthCredentials>;
}
