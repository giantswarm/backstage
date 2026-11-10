import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import { NotFoundError, ServiceUnavailableError } from '@backstage/errors';
import {
  experimental_createMCPClient as createMCPClient,
  MCPClient,
} from '@ai-sdk/mcp';
import {
  CLIENT_CAPABILITIES_META_KEY,
  type CallToolRequest,
  Client as SdkClient,
  type InputRequiredResult,
  isInputRequiredResult,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import {
  type McpToolRefusal,
  mcpToolRefusalOf,
  musterServerOfTool,
  MUSTER_INPUT_REQUIRED_STATUS,
  type MusterInputAnswer,
  type MusterUrlElicitation,
  readJwtClaims,
  serverInfoIconOf,
} from '@giantswarm/backstage-plugin-gs-common';
import {
  type ClosableMcpClient,
  describeMcpFailure,
  isRecoverableSessionError,
  McpClientCache,
} from '../mcp';
import {
  AUTH_LOGIN_TOOL,
  AUTH_LOGOUT_TOOL,
  AUTH_STATUS_RESOURCE,
  parseAuthLoginResult,
} from './authLogin';
import { PendingSignIns } from './pendingSignIns';
import { MusterUnreachableError } from './musterUnreachable';
import { createMusterFetch } from './musterFetch';
import { markReported } from '../errors';
import {
  FREQUENT_LOST_SESSIONS,
  FREQUENT_LOST_SESSIONS_WINDOW_MS,
  LostSessionTracker,
  sharedLostSessionTracker,
} from './lostSessions';

/**
 * The muster aggregator only exposes its meta-tools over MCP. Discovery
 * meta-tools (list_tools, filter_tools, ...) are invoked directly; concrete
 * aggregated tools (core_workflow_list, core_mcpserver_list, x_<server>_*,
 * workflow_<name>, ...) are invoked indirectly through the `call_tool`
 * meta-tool with the target tool name + arguments.
 */
const META_TOOLS = [
  'list_tools',
  'describe_tool',
  'list_core_tools',
  'filter_tools',
  'filter_resources',
  'filter_prompts',
  'call_tool',
] as const;

export type MetaToolName = (typeof META_TOOLS)[number];

/** Muster meta-tool used to execute any aggregated tool by name. */
const CALL_TOOL = 'call_tool';

/**
 * The page {@link MusterMcpClient.listTools} asks `list_tools` for, as
 * muster's own `ListAllTools` does: a usual catalogue arrives in one round
 * trip. Without a `limit`, muster answers 50 tools.
 */
const LIST_TOOLS_PAGE_SIZE = 1000;

/**
 * The most `list_tools` pages one listing reads: far above any real catalogue,
 * so a muster that keeps answering `truncated` fails the listing instead of
 * looping.
 */
const LIST_TOOLS_MAX_PAGES = 20;

/** What the paging reads of a `list_tools` page; the rest passes through. */
type ListToolsPage = Record<string, unknown> & {
  tools?: unknown[];
  truncated?: boolean;
};

export interface MusterServerConfig {
  url: string;
  headers?: Record<string, string>;
  /**
   * When set, requests to the muster server must carry a per-user OAuth
   * token for this auth provider (forwarded by the frontend).
   */
  authProvider?: string;
}

/**
 * One muster aggregator endpoint. A single muster federates many management
 * clusters, so the plugin can be pointed at several musters (one per
 * installation) and routes select the active one via `?installation=`.
 */
export interface MusterInstallationConfig extends MusterServerConfig {
  /** Stable installation id used for routing and as the client cache scope. */
  name: string;
  /**
   * Name of the MCP server (as registered in muster) that fronts this
   * installation's own Prometheus/Mimir, used by the `/usage` route. When
   * unset, the route falls back to the `<name>-mcp-prometheus` convention,
   * then to the only prometheus-ish server.
   */
  prometheusServer?: string;
  /**
   * Where the entry came from: `derived` from a `gs.installations` entry's
   * `baseDomain`, `configured` in `muster.installations` (or the legacy
   * `aiChat.mcp` entry). Set by `resolveMusterInstallations`; absent from
   * entries built elsewhere, which read as configured.
   */
  source?: 'derived' | 'configured';
}

/**
 * Read a single muster MCP server connection from the existing `aiChat.mcp`
 * config array (legacy single-installation path). The entry is selected by
 * name (`muster.serverName`, default `muster`) and supports the same
 * plain/static-header rules as ai-chat-backend's readMcpServersFromConfig.
 * Entries with `authProvider` require the frontend to forward a per-user
 * token; entries with `useBackstageUserToken` are unsupported and reported as
 * unconfigured.
 */
export function readMusterServerFromConfig(
  config: Config,
  logger: LoggerService,
): MusterServerConfig | undefined {
  const serverName = config.getOptionalString('muster.serverName') ?? 'muster';

  const mcpConfigs = config.getOptionalConfigArray('aiChat.mcp');
  const mcpConfig = mcpConfigs?.find(
    mcp => mcp.getOptionalString('name') === serverName,
  );
  if (!mcpConfig) {
    return undefined;
  }

  if (mcpConfig.getOptionalBoolean('useBackstageUserToken')) {
    logger.warn(
      `MCP server '${serverName}' is configured with useBackstageUserToken, which the muster backend plugin does not support. Muster endpoints will be disabled.`,
    );
    return undefined;
  }

  const url = mcpConfig.getString('url');
  const authProvider = mcpConfig.getOptionalString('authProvider');

  const headersConfig = mcpConfig.getOptionalConfig('headers');
  let headers: Record<string, string> | undefined;
  if (headersConfig) {
    headers = {};
    for (const key of headersConfig.keys()) {
      headers[key] = headersConfig.getString(key);
    }
  }

  return { url, headers, authProvider };
}

function readHeaders(
  headersConfig: Config | undefined,
): Record<string, string> | undefined {
  if (!headersConfig) {
    return undefined;
  }
  const headers: Record<string, string> = {};
  for (const key of headersConfig.keys()) {
    headers[key] = headersConfig.getString(key);
  }
  return headers;
}

/**
 * Resolve the set of muster installations the proxy can target, keyed by
 * installation name.
 *
 * Two sources, in order of precedence:
 *   1. `muster.installations` — an explicit list of `{ name, url,
 *      authProvider?, headers? }` entries (multi-installation).
 *   2. The legacy single `aiChat.mcp` entry selected by `muster.serverName`
 *      (default `muster`), registered under that name.
 *
 * Returns an empty map when nothing is configured.
 */
export function readMusterInstallationsFromConfig(
  config: Config,
  logger: LoggerService,
): Map<string, MusterInstallationConfig> {
  const installations = new Map<string, MusterInstallationConfig>();

  const explicit = config.getOptionalConfigArray('muster.installations');
  if (explicit && explicit.length > 0) {
    for (const entry of explicit) {
      const name = entry.getString('name');
      const url = entry.getString('url');
      if (installations.has(name)) {
        logger.warn(
          `Duplicate muster installation '${name}' in muster.installations; keeping the first.`,
        );
        continue;
      }
      installations.set(name, {
        name,
        url,
        authProvider: entry.getOptionalString('authProvider'),
        headers: readHeaders(entry.getOptionalConfig('headers')),
        prometheusServer: entry.getOptionalString('prometheusServer'),
      });
    }
    return installations;
  }

  const legacy = readMusterServerFromConfig(config, logger);
  if (legacy) {
    const name = config.getOptionalString('muster.serverName') ?? 'muster';
    installations.set(name, { name, ...legacy });
  }
  return installations;
}

/** One MCP content block, as far as the muster clients look at it. */
export interface McpContentItem {
  type: string;
  text?: string;
  /** Embedded resource block (`type: resource`), e.g. a downloaded file. */
  resource?: { uri?: string; mimeType?: string; text?: string };
}

type ContentItem = McpContentItem;

/**
 * A `call_tool` result taken apart: no text at all, the envelope's own
 * payload (`value` where it is JSON), or the wrapped tool's MCP result.
 */
type CallToolUnwrap =
  | { kind: 'empty' }
  | { kind: 'direct'; envelope: string; value?: unknown }
  | {
      kind: 'wrapped';
      text?: string;
      content: McpContentItem[];
      structuredContent?: unknown;
    };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The text blocks of an errored tool result, the human-readable message first.
 * When the text is itself a serialized MCP result (`{"isError":true,"content":[...]}`
 * — what `call_tool` puts in its envelope for a failed wrapped tool), these are
 * the inner text blocks; otherwise the text already is the message.
 */
function errorTextsOf(text: string): string[] {
  const inner = innerResultOf(text);
  if (!inner || !Array.isArray(inner.content)) {
    return [text];
  }
  const texts = (inner.content as ContentItem[])
    .filter(item => item?.type === 'text' && typeof item.text === 'string')
    .map(item => item.text as string);
  return texts.length > 0 ? texts : [text];
}

/** The MCP result serialized in `text`, when it is one. */
function innerResultOf(
  text: string,
): { content?: unknown; structuredContent?: unknown } | undefined {
  let inner: unknown;
  try {
    inner = JSON.parse(text);
  } catch {
    return undefined;
  }
  return inner !== null && typeof inner === 'object' ? inner : undefined;
}

/**
 * The URL elicitations of an `input_required` answer, keyed as muster keyed
 * them; undefined when it asks for anything else, or for nothing.
 */
function urlElicitationsOf(
  result: InputRequiredResult,
): MusterUrlElicitation[] | undefined {
  const requests = Object.entries(result.inputRequests ?? {});
  const elicitations: MusterUrlElicitation[] = [];
  for (const [key, request] of requests) {
    if (request.method !== 'elicitation/create') {
      return undefined;
    }
    const params = request.params as {
      mode?: unknown;
      url?: unknown;
      message?: unknown;
      elicitationId?: unknown;
    };
    if (params.mode !== 'url' || typeof params.url !== 'string') {
      return undefined;
    }
    elicitations.push({
      key,
      url: params.url,
      message: typeof params.message === 'string' ? params.message : '',
      ...(typeof params.elicitationId === 'string'
        ? { elicitationId: params.elicitationId }
        : {}),
    });
  }
  return elicitations.length > 0 ? elicitations : undefined;
}

/** `<iss> <sub>` of a JWT, read without verifying it; undefined otherwise. */
function subjectOf(token: string | undefined): string | undefined {
  const { iss, sub } = readJwtClaims(token) ?? {};
  return typeof sub === 'string' && sub !== ''
    ? `${typeof iss === 'string' ? iss : ''} ${sub}`
    : undefined;
}

/** muster's structured mark of a call a replica stop interrupted. */
const INTERRUPTED_META = 'giantswarm.io/interrupted';

/**
 * Whether muster marked an errored result interrupted: `_meta` carries
 * `"giantswarm.io/interrupted": {"reason", "retryable"}`
 * (docs/explanation/mcp-aggregation.md of giantswarm/muster), on the result
 * or on the wrapped result in its text.
 */
function interruptedOf(meta: unknown, text: string | undefined): boolean {
  const inner =
    text === undefined
      ? undefined
      : (innerResultOf(text) as { _meta?: unknown } | undefined)?._meta;
  return [meta, inner].some(
    candidate =>
      candidate !== null &&
      typeof candidate === 'object' &&
      (candidate as Record<string, unknown>)[INTERRUPTED_META] !== undefined,
  );
}

/**
 * The server an errored result is muster's auth_required answer for, and the
 * sign-in link it carries: `structuredContent: {status: "auth_required",
 * server, authUrl?}`, on the result or on the wrapped result in its text.
 */
function authRequiredOf(
  structuredContent: unknown,
  text: string | undefined,
): { server: string; authUrl?: string } | undefined {
  const structured = (structuredContent ??
    (text === undefined
      ? undefined
      : innerResultOf(text)?.structuredContent)) as
    | { status?: unknown; server?: unknown; authUrl?: unknown }
    | null
    | undefined;
  if (
    structured?.status !== 'auth_required' ||
    typeof structured.server !== 'string'
  ) {
    return undefined;
  }
  const authUrl =
    typeof structured.authUrl === 'string' && structured.authUrl !== ''
      ? structured.authUrl
      : undefined;
  return { server: structured.server, authUrl };
}

/**
 * What kind of failure a muster tool error is, where it is one the portal
 * knows: its status ({@link MUSTER_TOOL_ERROR_STATUS}) and its Sentry
 * grouping follow from it.
 *
 * - the refusals of the Agent Platform's MCP servers (agent-manager,
 *   model-manager, workspace-manager), as `mcpToolRefusalOf` in gs-common
 *   names them;
 * - `connector_refused` -- muster refused a connector write
 *   ({@link CONNECTOR_REFUSALS});
 * - `interrupted` -- the muster replica serving the call shut down (a
 *   rollout); the caller may send it again;
 * - `timeout` -- the MCP server gave no answer within muster's timeout for it;
 * - `client_not_connected` -- muster held no connection to the MCP server;
 * - `tool_not_found` -- this muster has no such tool;
 * - `sign_in_declined` -- the person declined or dismissed the sign-in muster
 *   asked them for (a URL elicitation), so the tool did not run.
 */
export type MusterToolErrorKind =
  | McpToolRefusal
  | 'connector_refused'
  | 'interrupted'
  | 'timeout'
  | 'client_not_connected'
  | 'tool_not_found'
  | 'sign_in_declined';

/**
 * The status each kind of tool error is answered with; any other tool error
 * has none, which the error middleware answers 500. Refusals are answers to
 * the person's request, below the 500 at which `MiddlewareFactory.error()`
 * logs an error and the root logger ships it to Sentry. The rest are faults
 * on the platform's side and stay reported, but for `interrupted`: the client
 * logs that at info and marks it reported (see {@link MusterMcpClient}), so
 * `reportedErrorHandler()` answers its 503 without a Sentry issue.
 *
 * `client_not_connected` and `tool_not_found` stay reported although a
 * session that has not signed in to a server yet answers them too: the
 * routes that expect that state (`asConnected` in `serverGateway.ts`, behind
 * plans, roadmap, repositories and platform-capabilities) catch them and
 * reconnect or answer a 401 before the middleware sees them. What reaches the
 * middleware comes from a page calling a tool directly, where they mean a
 * server muster lost or a tool this muster does not have, as well as a
 * missing sign-in. They are grouped per server and kind in Sentry
 * (`normalizeSentryEvent` in backend-common), not per tool.
 *
 * Muster's own auth_required answer is {@link MusterAuthRequiredError}'s 401.
 */
export const MUSTER_TOOL_ERROR_STATUS: Record<MusterToolErrorKind, number> = {
  not_found: 404,
  invalid_request: 400,
  invalid: 400,
  conflict: 409,
  gitops_owned: 409,
  already_exists: 409,
  forbidden: 403,
  not_member: 403,
  unsupported: 400,
  does_not_fit: 422,
  connector_refused: 422,
  interrupted: 503,
  timeout: 504,
  client_not_connected: 503,
  tool_not_found: 502,
  sign_in_declined: 412,
};

/**
 * muster's connector writes and their dry run, whose refusals are
 * `connector_refused` ({@link CONNECTOR_REFUSALS}). Reads (`get`, `list`,
 * `detect`) and `delete` keep the 500 of an unknown tool error.
 */
const CONNECTOR_WRITE_TOOLS = new Set([
  'core_mcpserver_create',
  'core_mcpserver_update',
  'core_mcpserver_validate',
]);

/**
 * The texts muster answers a refusal of a connector write with: a tool error
 * carries no structured reason, and muster reports its own failures as tool
 * errors too (a Kubernetes API error, a webhook that could not be called, a
 * Secret it could not write), which must stay 500 and reach Sentry. So only
 * these count, from muster's `internal/mcpserver` and `internal/callerwrite`:
 *
 * - the API server or the caller's RBAC refused the write (`Permission
 *   denied: your user may not …`), also as the cause of a client Secret that
 *   was not stored;
 * - the definition is invalid (`Invalid MCP server definition: …`, and the
 *   dry run's `Validation failed: …`);
 * - the name is taken (`MCP server 'x' already exists`, or the generated
 *   Secret name: `Secret "x" already exists …; retry …`);
 * - muster's own rules (`Cannot create|update MCP server 'x': …`: another
 *   server describes the issuer differently, the stored client belongs to
 *   another authorization server, a server outside muster's namespace);
 * - an admission policy denied the MCPServer (`ValidatingAdmissionPolicy …
 *   denied request: …`, e.g. a Secret its writer may not get).
 *
 * A failure in the same breath as a refusal stays a failure: a server left
 * behind because removing it failed too.
 */
const CONNECTOR_REFUSALS = [
  /^Permission denied: your user may not /,
  /^Invalid MCP server definition: /,
  /^Validation failed: /,
  /^MCP server '[^']*' already exists$/,
  /^Cannot (create|update) MCP server '[^']*': /,
  /^Cannot store the client credentials of MCP server '[^']*'(, so it was not (created|updated))?: (Permission denied: your user may not |Secret "[^"]*" already exists in namespace )/,
  /ValidatingAdmissionPolicy '[^']*' with binding '[^']*' denied request: /,
];
const CONNECTOR_FAILURES = [/Removing the server failed too/];

/**
 * muster's own texts for its failures of a call, as its aggregator words them
 * (wrapped in `Tool execution failed: …`, or on their own).
 */
const MUSTER_FAILURES: Array<[RegExp, MusterToolErrorKind]> = [
  [/^interrupted: /, 'interrupted'],
  [/no answer within the server's timeout/, 'timeout'],
  [/\bclient not connected\b/, 'client_not_connected'],
  [/\btool not found\b/, 'tool_not_found'],
  [
    /\bthe person answered (decline|cancel) to signing in\b/,
    'sign_in_declined',
  ],
];

/**
 * The kind of a tool's error, from its message; undefined when unknown.
 * `interrupted` is muster's structured mark of a rollout's interruption
 * (`_meta["giantswarm.io/interrupted"]`), which the text match only backs up.
 */
export function musterToolErrorKindOf(
  message: string,
  tool: string,
  options: { interrupted?: boolean } = {},
): MusterToolErrorKind | undefined {
  if (options.interrupted) {
    return 'interrupted';
  }
  const serverRefusal = mcpToolRefusalOf(musterServerOfTool(tool), message);
  if (serverRefusal) {
    return serverRefusal;
  }
  if (
    CONNECTOR_WRITE_TOOLS.has(tool) &&
    CONNECTOR_REFUSALS.some(refusal => refusal.test(message)) &&
    !CONNECTOR_FAILURES.some(failure => failure.test(message))
  ) {
    return 'connector_refused';
  }
  return MUSTER_FAILURES.find(([pattern]) => pattern.test(message))?.[1];
}

export { musterServerOfTool };

/** The call a tool error belongs to; never its arguments, which may carry secrets. */
export interface MusterToolCall {
  /** The tool called: an aggregated tool, or the meta-tool for a direct call. */
  tool: string;
  /** The muster installation that answered. */
  installation: string;
  /** muster marked the result interrupted (`_meta`), whatever its text. */
  interrupted?: boolean;
}

/**
 * A tool-level error (`isError`) of a muster call: the message is the tool's
 * first text block, as before; `details` are its further text blocks,
 * verbatim, where the tool answered more than one — cluster-manager's
 * `delete_node_pool` puts its structured refusal (`{"refused": {nodes, models,
 * hint}}`) in a second block next to the text. Backstage's error middleware
 * serializes an error's own properties, so `details` reaches the frontend
 * with the message.
 *
 * So do the `tool`, the MCP `server` it belongs to, the `installation`, and
 * the `kind` of failure with its `status` where it is a known one; the log
 * line and its Sentry event carry them as extra data, which groups the event
 * by kind and tool (`normalizeSentryEvent` in backend-common). Never the
 * call's arguments, which may carry secrets.
 */
export class MusterToolError extends Error {
  readonly name: string = 'MusterToolError';
  readonly details: string[];
  declare readonly tool?: string;
  declare readonly server?: string;
  declare readonly installation?: string;
  declare readonly kind?: MusterToolErrorKind;
  declare readonly status?: number;

  constructor(message: string, details: string[] = [], call?: MusterToolCall) {
    super(message);
    this.details = details;
    if (call) {
      const server = musterServerOfTool(call.tool);
      const kind = musterToolErrorKindOf(message, call.tool, {
        interrupted: call.interrupted,
      });
      Object.assign(this, {
        tool: call.tool,
        ...(server ? { server } : {}),
        installation: call.installation,
        ...(kind ? { kind, status: MUSTER_TOOL_ERROR_STATUS[kind] } : {}),
      });
    }
  }
}

/**
 * Muster's auth_required answer to a call of a server's tool: the caller's
 * session holds no grant for `server` and has to complete the sign-in at
 * `authUrl` (absent when muster could not start one, e.g. its sign-in rate
 * limit). `status` makes Backstage's error middleware answer it 401, a state
 * for the page to offer the sign-in at, not a failure of the backend.
 */
export class MusterAuthRequiredError extends MusterToolError {
  override readonly name = 'MusterAuthRequiredError';
  override readonly status = 401;

  constructor(
    override readonly server: string,
    readonly authUrl: string | undefined,
    [message, ...details]: string[],
  ) {
    super(
      message ?? `auth_required: server '${server}' requires authentication`,
      details,
    );
  }
}

/**
 * muster's `input_required` answer to a call that declared URL elicitation
 * ({@link MusterCallOptions.urlElicitation}): the tool has not run. The person
 * answers each page -- opens it, or declines -- and the call is sent again
 * with their answers and the `requestState` ({@link MusterInputAnswer}).
 * `status` is {@link MUSTER_INPUT_REQUIRED_STATUS}, a state for the page to
 * act on, below the 500 at which the error middleware reports to Sentry;
 * `elicitations` and `requestState` reach the page in the error body.
 */
export class MusterInputRequiredError extends MusterToolError {
  override readonly name = 'MusterInputRequiredError';
  override readonly status = MUSTER_INPUT_REQUIRED_STATUS;

  constructor(
    readonly elicitations: MusterUrlElicitation[],
    readonly requestState: string | undefined,
    call: MusterToolCall,
  ) {
    super(elicitations.map(elicitation => elicitation.message).join(' '), [], {
      tool: call.tool,
      installation: call.installation,
    });
  }
}

/** How a call of an aggregated tool is made. */
export interface MusterCallOptions {
  authToken?: string;
  /**
   * The caller can ask the person to open a page: the call declares URL mode
   * elicitation, so muster answers a sign-in the call needs with
   * {@link MusterInputRequiredError} instead of its auth_required tool error.
   */
  urlElicitation?: boolean;
  /** The person's answer to the call's {@link MusterInputRequiredError}. */
  input?: MusterInputAnswer;
  /**
   * Cancels a call that declares URL elicitation or answers one: muster is
   * sent `notifications/cancelled` and stops waiting on the sign-in.
   */
  signal?: AbortSignal;
}

/** One `notifications/progress` of a tool call, as muster relayed it. */
export interface MusterToolProgress {
  /** Higher than the one before it. */
  progress: number;
  total?: number;
  message?: string;
}

/**
 * How long a call that reports progress waits for the next notification or
 * its answer. Longer than muster's own per-server budget, so a server that
 * falls silent is cut by muster, which names the server's timeout.
 */
export const PROGRESS_IDLE_TIMEOUT_MS = 5 * 60_000;

/**
 * The longest a call that reports progress may run. Past muster's own
 * bound of one hour, so muster reports the cut.
 */
export const PROGRESS_CALL_MAX_MS = 65 * 60_000;

/**
 * How long a call on the official SDK may wait for its answer. muster bounds
 * a call itself (each server's timeout, an hour at most); the SDK's default
 * of a minute would cut a longer tool, and the retry of an accepted sign-in,
 * which muster holds until the sign-in completes.
 */
const TOOL_CALL_TIMEOUT_MS = PROGRESS_CALL_MAX_MS;

/** The capabilities a call that can ask the person to open a page declares. */
const URL_ELICITATION_CAPABILITIES = { elicitation: { url: {} } };

/** The part of an official MCP SDK client a tool call uses. */
export interface ToolCallClient extends ClosableMcpClient {
  callTool: SdkClient['callTool'];
  /** Ends the client's MCP session and closes the connection. */
  close(): Promise<void>;
}

/** One connection pool for every muster, with the connect timeout. */
const musterFetch = createMusterFetch();

/**
 * An official MCP SDK client of muster. It speaks protocol 2026-07-28 where
 * muster does, whose calls carry their own capabilities; an `input_required`
 * answer comes back to the caller (manual mode) rather than failing the call.
 */
async function connectToolCallClient(
  url: string,
  headers: Record<string, string> | undefined,
): Promise<ToolCallClient> {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers },
    fetch: musterFetch,
  });
  const client = new SdkClient(
    { name: 'muster-backend', version: '1.0.0' },
    {
      versionNegotiation: { mode: 'auto' },
      inputRequired: { autoFulfill: false },
    },
  );
  await client.connect(transport);
  return {
    callTool: client.callTool.bind(client),
    close: async () => {
      await transport.terminateSession().catch(() => undefined);
      await client.close();
    },
    // Read by McpClientCache, which chains its close hook onto it.
    transport,
  } as ToolCallClient;
}

/**
 * Thin client around a single muster MCP aggregator. It exposes muster's
 * meta-tools as typed JSON calls: discovery meta-tools are invoked directly,
 * concrete aggregated tools go through `call_tool`. Connections are cached per
 * user token via the shared McpClientCache (TTL-based + close-detected
 * recreation), scoped to this installation, so a server behind per-user auth
 * gets one MCP session per user instead of one global session.
 */
export class MusterMcpClient {
  private readonly cache: McpClientCache;
  /** The official SDK clients of calls that declare URL elicitation. */
  private readonly callCache: McpClientCache<ToolCallClient>;
  private readonly signIns: PendingSignIns;

  constructor(
    private readonly installation: MusterInstallationConfig,
    private readonly logger: LoggerService,
    private readonly clientFactory: (
      headers: Record<string, string> | undefined,
    ) => Promise<MCPClient> = headers =>
      createMCPClient({
        name: 'muster-backend',
        transport: {
          type: 'http',
          url: installation.url,
          headers,
          fetch: musterFetch,
        },
      }),
    private readonly toolCallClientFactory: (
      headers: Record<string, string> | undefined,
    ) => Promise<ToolCallClient> = headers =>
      connectToolCallClient(installation.url, headers),
    private readonly now: () => number = Date.now,
    private readonly lostSessions: LostSessionTracker = sharedLostSessionTracker,
  ) {
    this.cache = new McpClientCache(logger);
    this.callCache = new McpClientCache<ToolCallClient>(logger);
    this.signIns = new PendingSignIns(now);
  }

  /**
   * Runs a call of an aggregated tool for the caller, unless muster asked
   * the caller to sign in to the tool's server moments ago: then that
   * answer is the call's, and muster -- which starts a sign-in, one of the
   * few a person gets a minute, for every such call -- is not asked again
   * (see {@link PendingSignIns}).
   */
  private async gated<T>(
    toolName: string,
    options: MusterCallOptions | undefined,
    call: () => Promise<T>,
  ): Promise<T> {
    if (options?.urlElicitation || options?.input) {
      // muster reuses a session's pending sign-in itself, and answers it
      // as an elicitation the caller can put to the person: holding the call
      // here would answer auth_required, and hold a retry that carries the
      // person's answer to the elicitation.
      return call();
    }
    const caller = this.callerOf(options);
    const token = this.tokenOf(options);
    let pending = this.signIns.pendingFor(caller, toolName);
    if (pending && pending.token !== token) {
      // Another muster session of the person: muster may have connected it
      // with the person's grant. Its status says, without a sign-in.
      await this.signIns.check(caller, pending.server, token, () =>
        this.getResource(AUTH_STATUS_RESOURCE, options),
      );
      pending = this.signIns.pendingFor(caller, toolName);
    }
    if (pending) {
      // The link and muster's text belong to the token muster answered;
      // another token of the person (a reload, a second tab) learns only
      // that a sign-in is pending, and takes its link from its own
      // core_auth_login, the page's Sign in.
      throw pending.token === token
        ? new MusterAuthRequiredError(
            pending.server,
            pending.authUrl,
            pending.texts,
          )
        : new MusterAuthRequiredError(pending.server, undefined, [
            `auth_required: server '${pending.server}' requires authentication; a sign-in to it is pending for you, sign in to use its tools.`,
          ]);
    }
    try {
      return await call();
    } catch (error) {
      if (error instanceof MusterAuthRequiredError) {
        this.signIns.remember(caller, toolName, {
          server: error.server,
          authUrl: error.authUrl,
          texts: [error.message, ...error.details],
          token,
        });
      }
      throw error;
    }
  }

  /**
   * The person a call is made as: the issuer and subject of their muster
   * token, on this installation. Read, not verified: it only groups the
   * person's tokens, and a hold is only made from muster's answer to a
   * token muster accepted. A token that is no JWT is its own caller.
   */
  private callerOf(options: { authToken?: string } | undefined): string {
    const subject = subjectOf(options?.authToken);
    return subject
      ? McpClientCache.buildKey(`${this.installation.name}:person`, subject)
      : this.tokenOf(options);
  }

  /** The caller's token, as a key (never the token itself). */
  private tokenOf(options: { authToken?: string } | undefined): string {
    return McpClientCache.buildKey(this.installation.name, options?.authToken);
  }

  /**
   * The caller's own sign-in or sign-out of a server ends the wait for it:
   * connected or signed out, the server's calls go to muster again; a new
   * sign-in link replaces the one the calls carried.
   */
  private noteAuthTool(
    toolName: string,
    args: Record<string, unknown>,
    options: { authToken?: string } | undefined,
    result: { text?: string; structuredContent?: unknown },
  ): void {
    const server = args.server;
    if (typeof server !== 'string') {
      return;
    }
    const caller = this.callerOf(options);
    if (toolName === AUTH_LOGOUT_TOOL) {
      this.signIns.forget(caller, server);
    } else if (toolName === AUTH_LOGIN_TOOL) {
      const login = parseAuthLoginResult(result);
      if (login.status === 'auth_required' && login.authUrl) {
        this.signIns.restarted(
          caller,
          server,
          login.authUrl,
          this.tokenOf(options),
        );
      } else if (login.status === 'connected') {
        this.signIns.forget(caller, server);
      }
    }
  }

  /**
   * A server `auth://status` reads connected for the caller -- a sign-in
   * completed in the browser, or in another client of the person's -- has
   * its calls go to muster again at once.
   */
  private noteAuthStatus(
    status: unknown,
    options: { authToken?: string } | undefined,
  ): void {
    const servers = (status as { servers?: unknown } | null)?.servers;
    if (!Array.isArray(servers)) {
      return;
    }
    const caller = this.callerOf(options);
    for (const server of servers as { name?: unknown; status?: unknown }[]) {
      if (typeof server?.name === 'string' && server.status === 'connected') {
        this.signIns.forget(caller, server.name);
      }
    }
  }

  /**
   * Like {@link callTool}, for a tool that reports progress while it works.
   * The call carries a progressToken, each `notifications/progress` muster
   * relays reaches `onProgress`, and each one restarts the wait for the
   * answer, so the call lasts as long as the tool keeps reporting, up to
   * {@link PROGRESS_CALL_MAX_MS}. `signal` cancels the call, which muster
   * passes on to the tool.
   *
   * The call runs on an MCP session of its own, opened with the official
   * MCP SDK: the cached `@ai-sdk/mcp` client sends no progressToken and
   * drops notifications. Like {@link callTool}, it may declare URL
   * elicitation and carry the answer to one.
   */
  async callToolWithProgress(
    toolName: string,
    args: Record<string, unknown>,
    options: MusterCallOptions & {
      onProgress: (progress: MusterToolProgress) => void;
    },
  ): Promise<unknown> {
    return this.gated(toolName, options, async () => {
      let client: ToolCallClient;
      try {
        client = await this.toolCallClientFactory(
          this.headersFor(options.authToken),
        );
      } catch (error) {
        throw this.explain(error);
      }
      try {
        const result = await client.callTool(
          this.callToolParams(toolName, args, options),
          {
            onprogress: ({ progress, total, message }) =>
              options.onProgress({ progress, total, message }),
            resetTimeoutOnProgress: true,
            timeout: PROGRESS_IDLE_TIMEOUT_MS,
            maxTotalTimeout: PROGRESS_CALL_MAX_MS,
            signal: options.signal,
            allowInputRequired: true,
          },
        );
        return this.parseResult(
          this.answeredOrThrow(result, toolName),
          toolName,
        );
      } catch (error) {
        if (error instanceof MusterToolError) {
          throw error;
        }
        throw this.explain(error);
      } finally {
        await client.close().catch(() => undefined);
      }
    });
  }

  /**
   * Invoke a muster meta-tool directly (list_tools, filter_tools,
   * describe_tool, list_core_tools, call_tool) and return its parsed payload.
   */
  async invokeMetaTool(
    metaTool: MetaToolName,
    args: Record<string, unknown>,
    options?: { authToken?: string },
  ): Promise<unknown> {
    const result = await this.executeMetaTool(metaTool, args, options);
    return this.parseResult(result, metaTool);
  }

  /** Run a meta-tool and return its raw MCP result (no envelope parsing). */
  private async executeMetaTool(
    metaTool: MetaToolName,
    args: Record<string, unknown>,
    options?: { authToken?: string },
  ): Promise<unknown> {
    if (!META_TOOLS.includes(metaTool)) {
      throw new NotFoundError(`Unknown muster meta-tool: ${metaTool}`);
    }

    return this.withSessionRecovery(options, async client => {
      const tools = client.toolsFromDefinitions({
        tools: [{ name: metaTool, inputSchema: { type: 'object' as const } }],
      });

      const tool = tools[metaTool];
      if (!tool || typeof tool.execute !== 'function') {
        throw new ServiceUnavailableError(
          `Muster meta-tool ${metaTool} has no executor`,
        );
      }

      const result: unknown = await tool.execute(args, {
        toolCallId: `muster-backend-${metaTool}`,
        messages: [],
        // ai@7 added a required `context` field to ToolExecutionOptions
        // (formerly experimental_context). Muster meta-tools carry no tool
        // context, so pass undefined.
        context: undefined,
      });
      return result;
    });
  }

  /**
   * Run `op` on this caller's cached MCP client and, when it failed because
   * the MCP session is gone, once more on a fresh client (a new `initialize`).
   *
   * A lost session is a normal event for an MCP client: the gateway in front
   * of muster reaps sessions idle for its TTL, a gateway or muster roll drops
   * them, a request lands on another replica. The server answers 404 for the
   * id it forgot; the SDK's http transport then clears its id and reports the
   * error without closing, so every later request would go out without a
   * session id and be answered 400 -- until the cache TTL. Such a request was
   * rejected before it reached the tool, so running it again is safe even for
   * a mutation. Only a second failure reaches the caller, and any transport
   * failure reaches them in plain words (see {@link explain}).
   */
  private async withSessionRecovery<T>(
    options: { authToken?: string } | undefined,
    op: (client: MCPClient) => Promise<T> | T,
  ): Promise<T> {
    return this.recovering(this.cache, this.clientFactory, options, op);
  }

  /** {@link withSessionRecovery} on the official SDK client of a call. */
  private async withCallSessionRecovery<T>(
    options: { authToken?: string } | undefined,
    op: (client: ToolCallClient) => Promise<T> | T,
  ): Promise<T> {
    return this.recovering(
      this.callCache,
      this.toolCallClientFactory,
      options,
      op,
    );
  }

  private async recovering<C extends ClosableMcpClient, T>(
    cache: McpClientCache<C>,
    factory: (headers: Record<string, string> | undefined) => Promise<C>,
    options: { authToken?: string } | undefined,
    op: (client: C) => Promise<T> | T,
  ): Promise<T> {
    const first = await this.connectOrExplain(cache, factory, options);
    try {
      return await op(first.client);
    } catch (error) {
      if (!isRecoverableSessionError(error)) {
        throw this.explain(error);
      }
      cache.markDead(first.cacheKey, first.client);
      // Expected and usually recovered by the retry below, so not a warning:
      // only a second failure is actionable, and explain() reports that. A
      // loss on most requests is, though; noteLostSession() warns about that.
      this.logger.info(
        'Muster MCP session was lost; re-initializing and retrying once',
        { installation: this.installation.name, cause: messageOf(error) },
      );
      this.noteLostSession(first.client);
    }

    const second = await this.connectOrExplain(cache, factory, options);
    try {
      return await op(second.client);
    } catch (error) {
      if (isRecoverableSessionError(error)) {
        cache.markDead(second.cacheKey, second.client);
      }
      throw this.explain(error);
    }
  }

  /**
   * Warn when this installation lost {@link FREQUENT_LOST_SESSIONS} sessions
   * within {@link FREQUENT_LOST_SESSIONS_WINDOW_MS}, at most once per window
   * (see {@link LostSessionTracker}). Each loss is logged at `info`, so a
   * gateway that drops sessions on nearly every request (a TTL shorter than the
   * request interval, a session-key rotation) would otherwise only show as
   * slower requests. A loss whose retry fails too is counted as well; that
   * failure is reported on its own by {@link explain}.
   */
  private noteLostSession(client: object): void {
    if (!this.lostSessions.note(this.installation.name, client, this.now())) {
      return;
    }
    this.logger.warn(
      'Muster MCP sessions are lost often; requests re-initialize before they run',
      {
        installation: this.installation.name,
        lostSessions: FREQUENT_LOST_SESSIONS,
        windowMinutes: FREQUENT_LOST_SESSIONS_WINDOW_MS / 60_000,
      },
    );
  }

  private async connectOrExplain<C extends ClosableMcpClient>(
    cache: McpClientCache<C>,
    factory: (headers: Record<string, string> | undefined) => Promise<C>,
    options: { authToken?: string } | undefined,
  ) {
    try {
      return await this.connectTo(cache, factory, options);
    } catch (error) {
      throw this.explain(error);
    }
  }

  /**
   * The error the caller gets for a failed MCP request. The SDK's transport
   * text (`MCP HTTP Transport Error: POSTing to endpoint (HTTP 400): mcp:
   * session header is required ...`) is for the log; the person reading the
   * Models pages gets what happened in plain words, per installation. Errors
   * that are not the transport's -- a tool's own error, a 401 that the
   * frontend turns into its sign-in prompt -- pass through unchanged.
   */
  private explain(error: unknown): unknown {
    const reason = describeMcpFailure(error);
    if (reason === undefined) {
      return error;
    }
    // The installation goes in the metadata, not the message: Sentry groups
    // on the message, and `reason` is one of a few fixed texts, so this is one
    // issue per kind of failure rather than one per installation.
    this.logger.warn(`Muster MCP request failed: ${reason}`, {
      installation: this.installation.name,
      cause: messageOf(error),
    });
    return new MusterUnreachableError(this.installation.name, reason);
  }

  /**
   * Resolve the cached MCP client for this installation and caller. The cache is
   * keyed per user token, so a server behind per-user auth gets one MCP session
   * per user -- which is also what makes muster's per-session downstream auth
   * state (see getResource / auth://status) stable across requests.
   */
  private async connect(options?: { authToken?: string }): Promise<{
    client: MCPClient;
    cacheKey: string;
  }> {
    return this.connectTo(this.cache, this.clientFactory, options);
  }

  private async connectTo<C extends ClosableMcpClient>(
    cache: McpClientCache<C>,
    factory: (headers: Record<string, string> | undefined) => Promise<C>,
    options: { authToken?: string } | undefined,
  ): Promise<{ client: C; cacheKey: string }> {
    const authToken = options?.authToken;
    const cacheKey = McpClientCache.buildKey(this.installation.name, authToken);
    const client = await cache.getOrCreate(cacheKey, () =>
      factory(this.headersFor(authToken)),
    );
    return { client, cacheKey };
  }

  private headersFor(
    authToken: string | undefined,
  ): Record<string, string> | undefined {
    return authToken !== undefined
      ? { ...this.installation.headers, Authorization: `Bearer ${authToken}` }
      : this.installation.headers;
  }

  /**
   * Execute a concrete aggregated tool by name through the `call_tool`
   * meta-tool. This is the path for core_* tools, workflow_<name> runs, and
   * x_<server>_* aggregated tools. The caller (router) is responsible for the
   * read-only/mutation safety gate.
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    options?: MusterCallOptions,
  ): Promise<unknown> {
    return this.gated(toolName, options, async () => {
      const result = await this.executeCallTool(toolName, args, options);
      // The tool's own name, not `call_tool`'s: a tool error names it.
      return this.parseResult(result, toolName);
    });
  }

  /**
   * Like {@link callTool}, but returns the wrapped tool's text and its MCP
   * `structuredContent` both, where {@link callTool} answers one of them: for
   * a tool whose text is meant for the person next to the data, such as
   * `core_auth_login`'s challenge with its sign-in URL in `structuredContent`
   * (muster#1025). Tool-level errors throw, same as callTool.
   */
  async callToolWithStructured(
    toolName: string,
    args: Record<string, unknown>,
    options?: MusterCallOptions,
  ): Promise<{ text?: string; structuredContent?: unknown }> {
    const answer = await this.gated(toolName, options, async () => {
      const result = await this.executeCallTool(toolName, args, options);
      const unwrapped = this.unwrapCallTool(result, toolName);
      switch (unwrapped.kind) {
        case 'empty':
          return {};
        case 'direct':
          return { text: unwrapped.envelope };
        default:
          return {
            text: unwrapped.text,
            structuredContent: unwrapped.structuredContent,
          };
      }
    });
    this.noteAuthTool(toolName, args, options, answer);
    return answer;
  }

  /**
   * Like {@link callTool}, but returns every content block of the wrapped
   * tool's result instead of the parsed first text block. For tools whose
   * payload is not (only) in the first text block -- GitHub's
   * `get_file_contents` answers with a status line plus an embedded resource
   * carrying the file. Tool-level errors throw, same as callTool.
   */
  async callToolContent(
    toolName: string,
    args: Record<string, unknown>,
    options?: MusterCallOptions,
  ): Promise<McpContentItem[]> {
    const content = await this.gated(toolName, options, async () => {
      const result = await this.executeCallTool(toolName, args, options);
      const unwrapped = this.unwrapCallTool(result, toolName);
      switch (unwrapped.kind) {
        case 'empty':
          return [];
        case 'direct':
          return [{ type: 'text', text: unwrapped.envelope }];
        default:
          return unwrapped.content;
      }
    });
    this.noteAuthTool(toolName, args, options, {});
    return content;
  }

  /**
   * Every tool of the caller's catalogue. `list_tools` answers one page, so
   * this reads page after page until one is not `truncated`, as muster's own
   * `ListAllTools` does, and answers the first page with the tools of every
   * page. A failed page fails the listing.
   */
  async listTools(options?: { authToken?: string }): Promise<unknown> {
    let all: ListToolsPage | undefined;
    for (let page = 0; page < LIST_TOOLS_MAX_PAGES; page++) {
      const tools = all?.tools ?? [];
      const next = (await this.invokeMetaTool(
        'list_tools',
        { limit: LIST_TOOLS_PAGE_SIZE, offset: tools.length },
        options,
      )) as ListToolsPage;
      const added = next.tools ?? [];
      all = all
        ? {
            ...all,
            tools: [...tools, ...added],
            filtered_count: tools.length + added.length,
            total: next.total,
            truncated: next.truncated,
          }
        : next;
      // A page without tools cannot move the offset on, whatever it claims.
      if (!next.truncated || added.length === 0) {
        return all;
      }
    }
    throw new ServiceUnavailableError(
      // No installation in the text: the error middleware's Sentry event would
      // be one issue per installation. Pages print it under the installation.
      `Muster's list_tools was still truncated after ${LIST_TOOLS_MAX_PAGES} pages`,
    );
  }

  async filterTools(
    args: Record<string, unknown>,
    options?: { authToken?: string },
  ): Promise<unknown> {
    return this.invokeMetaTool('filter_tools', args, options);
  }

  async filterResources(
    args: Record<string, unknown>,
    options?: { authToken?: string },
  ): Promise<unknown> {
    return this.invokeMetaTool('filter_resources', args, options);
  }

  async filterPrompts(
    args: Record<string, unknown>,
    options?: { authToken?: string },
  ): Promise<unknown> {
    return this.invokeMetaTool('filter_prompts', args, options);
  }

  async describeTool(
    name: string,
    options?: { authToken?: string },
  ): Promise<unknown> {
    return this.invokeMetaTool('describe_tool', { name }, options);
  }

  async listCoreTools(
    args: Record<string, unknown>,
    options?: { authToken?: string },
  ): Promise<unknown> {
    return this.invokeMetaTool('list_core_tools', args, options);
  }

  /**
   * Read one of the aggregator's own MCP resources by URI, via a native
   * `resources/read`. Used for `auth://status`, the per-session view of which
   * aggregated servers this user is authenticated to.
   *
   * This deliberately does NOT go through the `get_resource` meta-tool: that one
   * aggregates the resources of the *downstream* servers and never sees
   * `auth://status`, which muster registers on the aggregator's own MCP server
   * (`list_resources` reports "No resources available" against a muster whose
   * downstream servers expose none). muster's own CLI reads it the same way --
   * `mcp.ReadResourceRequest` in `cmd/auth_helpers.go`.
   *
   * Resource contents are JSON text; the first text block is parsed.
   */
  async getResource(
    uri: string,
    options?: { authToken?: string },
  ): Promise<unknown> {
    const result = await this.withSessionRecovery(options, client =>
      client.readResource({ uri }),
    );

    const text = result.contents.find(
      (content): content is typeof content & { text: string } =>
        typeof (content as { text?: unknown }).text === 'string',
    )?.text;

    if (text === undefined) {
      throw new ServiceUnavailableError(
        `Muster resource ${uri} returned no text content`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return text;
    }
    if (uri === AUTH_STATUS_RESOURCE) {
      this.noteAuthStatus(parsed, options);
    }
    return parsed;
  }

  /**
   * The icon muster announces in its `initialize` result (`serverInfo.icons`,
   * since muster v5.59.0), when `serverInfoIconOf` accepts one; none from an
   * older muster. Read off the caller's cached session -- the one their tool
   * listings use -- so it opens no connection of its own where one is open.
   *
   * A failure to connect is thrown as it is, not explained: the icon is a
   * nicety, and the caller's other reads report an unreachable muster.
   */
  async serverIcon(options?: {
    authToken?: string;
  }): Promise<string | undefined> {
    const { client } = await this.connect(options);
    return serverInfoIconOf(client.serverInfo);
  }

  async dispose(): Promise<void> {
    await Promise.all([this.cache.dispose(), this.callCache.dispose()]);
  }

  /**
   * Run `call_tool` for an aggregated tool and return its raw MCP result. A
   * call that declares URL elicitation or answers one runs on the official
   * SDK's client, the only one of the two that hands muster's
   * `input_required` back; any other on the cached `@ai-sdk/mcp` client.
   */
  private async executeCallTool(
    toolName: string,
    args: Record<string, unknown>,
    options: MusterCallOptions | undefined,
  ): Promise<unknown> {
    if (!options?.urlElicitation && !options?.input) {
      return this.executeMetaTool(
        CALL_TOOL,
        { name: toolName, arguments: args },
        options,
      );
    }
    const result = await this.withCallSessionRecovery(options, client =>
      client.callTool(this.callToolParams(toolName, args, options), {
        timeout: TOOL_CALL_TIMEOUT_MS,
        allowInputRequired: true,
        signal: options.signal,
      }),
    );
    return this.answeredOrThrow(result, toolName);
  }

  /**
   * The `call_tool` request of a call: on protocol 2026-07-28 a request
   * carries the client's capabilities, so one that can ask the person
   * declares URL elicitation there and the others do not; a retry carries
   * the person's answers and muster's `requestState` as it came.
   */
  private callToolParams(
    toolName: string,
    args: Record<string, unknown>,
    options: MusterCallOptions,
  ): CallToolRequest['params'] {
    const { input } = options;
    return {
      name: CALL_TOOL,
      arguments: { name: toolName, arguments: args },
      ...(options.urlElicitation || input
        ? {
            _meta: {
              [CLIENT_CAPABILITIES_META_KEY]: URL_ELICITATION_CAPABILITIES,
            },
          }
        : {}),
      ...(input
        ? {
            inputResponses: input.inputResponses,
            ...(input.requestState !== undefined
              ? { requestState: input.requestState }
              : {}),
          }
        : {}),
    };
  }

  /**
   * The result of a call, or the {@link MusterInputRequiredError} of muster's
   * `input_required` answer. An answer asking for anything but URL
   * elicitations -- a form, sampling, roots, none of which the call declared
   * -- or for nothing at all is a tool error: the portal has nothing to put to
   * the person.
   */
  private answeredOrThrow(result: unknown, toolName: string): unknown {
    if (!isInputRequiredResult(result)) {
      return result;
    }
    const elicitations = urlElicitationsOf(result);
    if (!elicitations) {
      throw this.toolError(
        `${toolName} asked for input the portal cannot give.`,
        [],
        toolName,
        false,
      );
    }
    throw new MusterInputRequiredError(elicitations, result.requestState, {
      tool: toolName,
      installation: this.installation.name,
    });
  }

  /**
   * Unwrap an MCP tool result's first text content block. Tool-level errors
   * (isError) surface as exceptions with the error text.
   *
   * muster's `call_tool` mirrors the wrapped tool's isError onto its own
   * envelope, so an errored envelope carries the serialized inner MCP result
   * as its text — the thrown message must be the inner human-readable text,
   * not that JSON structure (which the UI would otherwise show verbatim).
   */
  private unwrapTextContent(
    result: unknown,
    toolName: string,
  ): string | undefined {
    const { content, isError, structuredContent, _meta } = (result ?? {}) as {
      content?: ContentItem[];
      isError?: boolean;
      structuredContent?: unknown;
      _meta?: unknown;
    };

    const text = content?.find(item => item.type === 'text')?.text;

    if (isError) {
      const texts = text === undefined ? [] : errorTextsOf(text);
      const authRequired = authRequiredOf(structuredContent, text);
      if (authRequired) {
        throw new MusterAuthRequiredError(
          authRequired.server,
          authRequired.authUrl,
          texts,
        );
      }
      const [message, ...details] = texts;
      throw this.toolError(
        message ?? `Muster tool ${toolName} failed without an error message`,
        details,
        toolName,
        interruptedOf(_meta, text),
      );
    }

    return text;
  }

  /**
   * The {@link MusterToolError} of a call of `toolName` on this installation.
   * A rollout's interruption is an expected outcome the caller may retry: it
   * is logged here at info, with the call in the metadata, and marked
   * reported, so `reportedErrorHandler()` answers its 503 without the error
   * middleware sending it to Sentry.
   */
  private toolError(
    message: string,
    details: string[],
    toolName: string,
    interrupted: boolean,
  ): MusterToolError {
    const error = new MusterToolError(message, details, {
      tool: toolName,
      installation: this.installation.name,
      interrupted,
    });
    if (error.kind === 'interrupted') {
      this.logger.info('Muster tool call was interrupted by a muster rollout', {
        tool: error.tool,
        server: error.server,
        installation: error.installation,
        cause: message,
      });
      markReported(error);
    }
    return error;
  }

  /**
   * Discovery meta-tools return their payload as a single JSON text block
   * (one unwrap), while `call_tool` wraps the target tool's MCP result as a
   * JSON string inside its own text block (two unwraps). This unwraps the
   * outer envelope and, when the inner value is itself a `{ content: [...] }`
   * MCP result, takes it apart once more ({@link unwrapCallTool}); errors
   * throw on either level.
   */
  private unwrapCallTool(result: unknown, toolName: string): CallToolUnwrap {
    const envelope = this.unwrapTextContent(result, toolName);
    if (envelope === undefined) {
      return { kind: 'empty' };
    }
    let inner: unknown;
    try {
      inner = JSON.parse(envelope);
    } catch {
      // Not a JSON envelope; the tool's direct payload.
      return { kind: 'direct', envelope };
    }
    if (
      inner === null ||
      typeof inner !== 'object' ||
      !Array.isArray((inner as { content?: unknown }).content)
    ) {
      // A direct JSON payload (discovery meta-tools, or a server that exposes
      // tools without the call_tool envelope).
      return { kind: 'direct', envelope, value: inner };
    }
    const { content, structuredContent } = inner as {
      content: McpContentItem[];
      structuredContent?: unknown;
    };
    return {
      kind: 'wrapped',
      text: this.unwrapTextContent(inner, toolName),
      content,
      structuredContent,
    };
  }

  /**
   * The tool's machine-readable answer. MCP makes `structuredContent` the
   * result and the text block its rendering, so an object
   * `structuredContent` wins wherever a tool answers one (mcp-go's
   * `NewToolResultStructured(data, "3 workspaces")`, or no text block at
   * all); the text, parsed as JSON where it is JSON, otherwise.
   */
  private parseResult(result: unknown, toolName: string): unknown {
    const unwrapped = this.unwrapCallTool(result, toolName);
    switch (unwrapped.kind) {
      case 'empty':
        return undefined;
      case 'direct':
        return 'value' in unwrapped ? unwrapped.value : unwrapped.envelope;
      default:
        break;
    }
    const { text, structuredContent } = unwrapped;
    if (structuredContent !== null && typeof structuredContent === 'object') {
      return structuredContent;
    }
    if (text === undefined) {
      return undefined;
    }
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
}
