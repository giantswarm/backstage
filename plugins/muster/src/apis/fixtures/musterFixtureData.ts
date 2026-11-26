import {
  type ConnectorName,
  TAGS_ANNOTATION,
} from '@giantswarm/backstage-plugin-gs-common';
import type {
  ConnectorState,
  FixtureConnector,
  FixtureExecution,
  FixtureInstallation,
  FixtureWorkflow,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import { MUSTER_NAMESPACE } from '../../lib/musterNamespace';
import type {
  MCPServer,
  MCPServerCondition,
  MCPServerState,
} from '../../lib/k8s/MCPServer';
import {
  type MusterWorkflow,
  type WorkflowArgDefinition,
  WORKFLOW_CATEGORY_LABEL,
} from '../../lib/k8s/MusterWorkflow';
import {
  approvalKeyOf,
  expandPreset,
  type ApprovalPreset,
} from '../../lib/toolApproval';
import type {
  JsonSchema,
  MCPServerApproval,
  McpServerRuntime,
  MusterInstallationInfo,
  PromptSummary,
  ResourceSummary,
  ServerAuthStatus,
  McpToolLatency,
  McpUsage,
  McpUsageBucket,
  ToolSummary,
  WorkflowExecution,
  WorkflowExecutionStep,
  WorkflowExecutionSummary,
  WorkflowListItem,
  WorkflowStats,
} from '../types';

/**
 * The fixture data set's records as the muster plugin's clients read them
 * (docs/fixtures.md). Each function maps one record onto the type a client
 * returns, so a change to that type breaks the fixture's build.
 */

/** The namespace muster's own MCP servers and workflows live in. */
export const FIXTURE_MUSTER_NAMESPACE = MUSTER_NAMESPACE;

/** `/installations`' entry for an installation. */
export function musterInstallationOf(
  installation: FixtureInstallation,
): MusterInstallationInfo {
  const reachable = {
    reachable: true,
    unreachable: false,
    unknown: 'unknown',
  } as const;
  return {
    name: installation.name,
    endpoint: `https://muster.${installation.name}.example.com/mcp`,
    requiresAuth: true,
    reachable: reachable[installation.state],
    ...(installation.state === 'unreachable' && { reason: 'timeout' }),
  };
}

/**
 * The `Ready` condition muster writes in each state. Keyed by muster's
 * states, so a state muster adds breaks the build here.
 */
const READY: Record<
  MCPServerState,
  Pick<MCPServerCondition, 'status' | 'message'>
> = {
  Connected: { status: 'True', message: 'Connected.' },
  Running: { status: 'True', message: 'Running.' },
  'Auth Required': {
    status: 'True',
    message: 'Sign in to use this connector.',
  },
  'Awaiting Session': {
    status: 'True',
    message: 'Serves each session with its caller’s own identity.',
  },
  Starting: { status: 'Unknown', message: 'Starting.' },
  Connecting: { status: 'Unknown', message: 'Connecting.' },
  Stopped: { status: 'False', message: 'Stopped.' },
  Disconnected: {
    status: 'False',
    message: 'The connection closed; muster retries.',
  },
  Failed: {
    status: 'False',
    message: 'The server did not answer within the timeout.',
  },
};

/** The states muster reports an error and failed attempts in. */
const FAILING: ReadonlySet<MCPServerState> = new Set([
  'Disconnected',
  'Failed',
]);

/**
 * The states this session is connected and lists tools in. `Auth Required`
 * and `Awaiting Session` are healthy but serve this session nothing yet.
 */
const CONNECTED: ReadonlySet<MCPServerState> = new Set([
  'Connected',
  'Running',
]);

/**
 * A connector as muster serves it live: the data set's record, with the tool
 * prefix its definition sets, if any (`spec.toolPrefix`).
 */
export type MusterFixtureConnector = FixtureConnector & {
  toolPrefix?: string;
  /** `spec.approval`, as seeded or written; absent: not reviewed. */
  approval?: MCPServerApproval;
  /** `metadata.generation`, bumped by every write to the spec. */
  generation?: number;
  /**
   * Why approvals cannot be answered where this connector is served (a
   * prerequisite is missing): reported as `approval.unavailable` on each of
   * its tools that asks.
   */
  approvalUnavailable?: string;
  /**
   * The person may not update MCPServers in muster's namespace here: its
   * tools report `connectorAdmin: false` and every write to it is refused
   * with the apiserver's RBAC text (`FIXTURE_NOT_EDITOR`).
   */
  notEditor?: boolean;
};

/**
 * What muster on the data set's second installation reports: its storage is
 * not shared, so a tool that asks is refused (fixtures, tool approval).
 */
export const FIXTURE_APPROVAL_UNAVAILABLE =
  "muster's shared store is not on Valkey";

/**
 * What the apiserver's RBAC says to a person who may not update MCPServers
 * in muster's namespace, as muster passes it on (fixtures: the data set's
 * second installation, where the guest is no editor).
 */
export function fixtureNotEditorText(name: string): string {
  return `mcpservers.muster.giantswarm.io "${name}" is forbidden: User "guest@example.com" cannot update resource "mcpservers" in API group "muster.giantswarm.io" in the namespace "${FIXTURE_MUSTER_NAMESPACE}"`;
}

/**
 * The segment muster names a connector's tools and prompts with,
 * `x_<segment>_<tool>`: its tool prefix, else its name (as
 * `MCPServer.getToolNamePrefix` reads it).
 */
function toolSegmentOf(connector: MusterFixtureConnector): string {
  const segment = connector.toolPrefix || connector.name;
  return connector.namespace ? `${connector.namespace}_${segment}` : segment;
}

/**
 * What muster names a connector by: its name in muster's namespace,
 * `<namespace>/<name>` in an organization's (`MCPServerKey`).
 */
export function connectorKeyOf(connector: FixtureConnector): string {
  return connector.namespace
    ? `${connector.namespace}/${connector.name}`
    : connector.name;
}

/**
 * The `metadata.uid` of a connector's MCPServer in fixture mode: made up,
 * stable per installation and server key, so a grant agent-manager's
 * fixture records matches what muster's fixture reports (tool approval).
 */
export function fixtureMcpServerUid(
  installation: string,
  serverKey: string,
): string {
  return `fixture-uid-${installation}-${serverKey.replace(/[^a-z0-9-]/g, '-')}`;
}

/** The MCPServer behind a connector's tools, as `filter_tools` reports it with `agentTools`. */
export function connectorRefOf(
  connector: MusterFixtureConnector,
  tool?: ToolSummary,
): {
  server: string;
  namespace: string;
  name: string;
  uid: string;
  tool?: string;
} {
  const server = connectorKeyOf(connector);
  return {
    server,
    namespace: connector.namespace ?? FIXTURE_MUSTER_NAMESPACE,
    name: connector.name,
    uid: fixtureMcpServerUid(connector.installation, server),
    ...(tool && { tool: approvalToolKeyOf(tool, connector) }),
  };
}

/** Whether a connector serves this session tools, resources and prompts. */
export function isServing(connector: FixtureConnector): boolean {
  return CONNECTED.has(connector.state);
}

function authOf(state: ConnectorState) {
  if (state === 'Auth Required') {
    return { type: 'oauth' as const };
  }
  if (state === 'Awaiting Session') {
    return { type: 'oauth' as const, forwardToken: true };
  }
  return undefined;
}

/** A connector as the `MCPServer` object the muster pages list. */
export function mcpServerObjectOf(
  connector: FixtureConnector,
): MCPServer['jsonData'] {
  const failing = FAILING.has(connector.state);
  const auth = authOf(connector.state);
  return {
    apiVersion: 'muster.giantswarm.io/v1alpha1',
    kind: 'MCPServer',
    metadata: {
      name: connector.name,
      namespace: connector.namespace ?? FIXTURE_MUSTER_NAMESPACE,
      annotations: { 'ui.giantswarm.io/display-name': connector.displayName },
    },
    spec: {
      type: 'streamable-http',
      toolPrefix: connector.name,
      description: connector.description,
      url: connector.url,
      ...(auth && { auth }),
    },
    status: {
      state: connector.state,
      conditions: [
        {
          type: 'Ready',
          reason: connector.state.replace(/ /g, ''),
          ...READY[connector.state],
        },
      ],
      ...(failing && {
        lastError: READY[connector.state].message,
        consecutiveFailures: 3,
      }),
    },
  };
}

/** A connector as `core_mcpserver_list` reports it live. */
export function mcpServerRuntimeOf(
  connector: MusterFixtureConnector,
): McpServerRuntime {
  return {
    name: connector.name,
    ...(connector.namespace && { key: connectorKeyOf(connector) }),
    namespace: connector.namespace ?? FIXTURE_MUSTER_NAMESPACE,
    displayName: connector.displayName,
    toolPrefix: connector.name,
    type: 'streamable-http',
    state: connector.state,
    ...(CONNECTED.has(connector.state) && {
      sessionStatus: 'connected',
      toolsCount: connector.toolsCount,
      resourcesCount: connectorResourcesOf(connector).length,
      promptsCount: connectorPromptsOf(connector).length,
    }),
    ...(FAILING.has(connector.state) && {
      error: READY[connector.state].message,
      consecutiveFailures: 3,
    }),
    ...(connector.approval && { approval: connector.approval }),
    ...(connector.generation !== undefined && {
      generation: connector.generation,
    }),
  };
}

/** A connector as `/servers/names` names it. */
export function connectorNameOf(connector: FixtureConnector): ConnectorName {
  return {
    name: connectorKeyOf(connector),
    displayName: connector.displayName,
  };
}

/** What a connector's tools do, in turn; the first ones only read. */
const TOOL_VERBS = [
  'list',
  'get',
  'search',
  'describe',
  'create',
  'update',
  'delete',
] as const;
const READ_ONLY_VERBS: ReadonlySet<string> = new Set([
  'list',
  'get',
  'search',
  'describe',
]);
/** What a connector's tools act on, one noun per round of verbs. */
const TOOL_NOUNS = [
  'records',
  'reports',
  'events',
  'pipelines',
  'schedules',
  'notes',
] as const;

/**
 * A connector's tools, `toolsCount` of them, as `filter_tools` lists them
 * with their schema. Named `x_<tool prefix>_<verb>_<noun>`, the prefix being
 * the connector's tool prefix or name ({@link toolSegmentOf}). Derived from
 * the connector alone, so every read names the same tools.
 */
export function connectorToolsOf(
  connector: MusterFixtureConnector,
): ToolSummary[] {
  return Array.from({ length: connector.toolsCount }, (_, index) => {
    const verb = TOOL_VERBS[index % TOOL_VERBS.length];
    const noun =
      TOOL_NOUNS[Math.floor(index / TOOL_VERBS.length) % TOOL_NOUNS.length];
    const round = Math.floor(index / (TOOL_VERBS.length * TOOL_NOUNS.length));
    const tool = `${verb}_${noun}${round > 0 ? `_${round + 1}` : ''}`;
    const description = `${verb[0].toUpperCase()}${verb.slice(1)} the ${noun} of ${connector.displayName}.`;
    const byName = verb !== 'list' && verb !== 'search' && verb !== 'create';
    return {
      name: `x_${toolSegmentOf(connector)}_${tool}`,
      summary: description,
      description,
      server: connectorKeyOf(connector),
      kind: 'tool',
      annotations: READ_ONLY_VERBS.has(verb)
        ? { readOnlyHint: true }
        : { readOnlyHint: false, destructiveHint: verb === 'delete' },
      inputSchema: {
        type: 'object',
        properties: {
          ...(byName && {
            name: { type: 'string', description: `The ${noun}' name.` },
          }),
          ...(verb === 'search' && {
            query: { type: 'string', description: 'What to look for.' },
          }),
          limit: {
            type: 'integer',
            description: 'The most items to return.',
            default: 20,
          },
        },
        required: [
          ...(byName ? ['name'] : []),
          ...(verb === 'search' ? ['query'] : []),
        ],
      },
    };
  });
}

/** A serving connector's resources, as `filter_resources` lists them. */
export function connectorResourcesOf(
  connector: FixtureConnector,
): ResourceSummary[] {
  if (!isServing(connector)) {
    return [];
  }
  return [
    {
      uri: `${connector.name}://docs/readme`,
      name: 'README',
      description: `How to use ${connector.displayName}.`,
      mimeType: 'text/markdown',
      server: connectorKeyOf(connector),
    },
    {
      uri: `${connector.name}://config/limits`,
      name: 'Limits',
      description: 'The rate limits that apply to this connector.',
      mimeType: 'application/json',
      server: connectorKeyOf(connector),
    },
  ];
}

/** A serving connector's prompts, as `filter_prompts` lists them. */
export function connectorPromptsOf(
  connector: MusterFixtureConnector,
): PromptSummary[] {
  if (!isServing(connector)) {
    return [];
  }
  return [
    {
      name: `x_${toolSegmentOf(connector)}_summarize`,
      description: `Summarize what changed in ${connector.displayName} today.`,
      server: connectorKeyOf(connector),
    },
  ];
}

/**
 * The person's state with a connector in this muster session, as
 * `auth://status` reports it, following the connector's state: signed in
 * where it serves, a sign-in of their own where it asks for one, the company
 * login where it forwards it.
 */
export function authStatusOf(connector: FixtureConnector): ServerAuthStatus {
  const name = connectorKeyOf(connector);
  switch (connector.state) {
    case 'Connected':
    case 'Running':
      return { name, status: 'connected', kind: 'none' };
    case 'Auth Required':
      return {
        name,
        status: 'auth_required',
        kind: 'grant',
        grant_scope: 'subject',
        auth_tool: 'core_auth_login',
        issuer: `https://auth.${connector.name}.example.com`,
      };
    case 'Awaiting Session':
      return {
        name,
        status: 'sso_pending',
        kind: 'sso',
        token_forwarding_enabled: true,
      };
    case 'Disconnected':
      return { name, status: 'unreachable', error: READY.Disconnected.message };
    case 'Failed':
      return { name, status: 'failed', error: READY.Failed.message };
    default:
      return { name, status: 'disconnected' };
  }
}

/**
 * The arguments of an MCP server definition, as muster's connector tools
 * declare them: the New connector flow sends `displayName` and `tags` only to
 * a tool whose schema lists them.
 */
const MCPSERVER_DEFINITION: Record<string, JsonSchema> = {
  name: { type: 'string', description: 'The MCP server’s name.' },
  displayName: { type: 'string' },
  description: { type: 'string' },
  tags: { type: 'array', items: { type: 'string' } },
  type: { type: 'string', enum: ['streamable-http', 'sse'] },
  url: { type: 'string' },
  auth: { type: 'object' },
};

/**
 * The arguments of muster's `core_mcpserver_connect` besides `name`: where the
 * server is and how muster reaches it (`connectFields` and the client
 * arguments in muster's `internal/mcpserver/connector_writes.go`).
 */
export const CONNECT_ARGUMENTS: readonly string[] = [
  'type',
  'toolPrefix',
  'family',
  'command',
  'args',
  'url',
  'env',
  'headers',
  'headersFrom',
  'requestMeta',
  'meta',
  'auth',
  'clientCredentials',
  'clearClientCredentials',
];

/**
 * The arguments of muster's `core_mcpserver_update` besides `name`: what
 * changes no target (`updateFields` in `connector_writes.go`).
 */
export const UPDATE_ARGUMENTS: readonly string[] = [
  'description',
  'displayName',
  'tags',
  'autoStart',
  'timeout',
  'progress',
  'suspended',
  'restartRequestedAt',
];

/** The definition's arguments one of the split writes declares. */
function definitionArguments(
  names: readonly string[],
): Record<string, JsonSchema> {
  const all: Record<string, JsonSchema> = {
    ...MCPSERVER_DEFINITION,
    autoStart: { type: 'boolean' },
    timeout: { type: 'integer' },
    suspended: { type: 'boolean' },
    restartRequestedAt: { type: 'string' },
    headers: { type: 'object' },
    requestMeta: { type: 'object' },
    clientCredentials: { type: 'object' },
    clearClientCredentials: { type: 'boolean' },
    toolPrefix: { type: 'string' },
  };
  return Object.fromEntries(
    ['name', ...names].filter(name => all[name]).map(name => [name, all[name]]),
  );
}

/** The `preset` argument of muster's connector writes (tool approval). */
const APPROVAL_PRESET_ARGUMENT: JsonSchema = {
  type: 'string',
  enum: ['recommended', 'allow-all', 'ask-all'],
  description: 'Fills every tool from its annotations, then stores them.',
};

/**
 * muster's own `core_*` tools, as `filter_tools` lists them for the muster
 * row of the servers list.
 */
export const FIXTURE_CORE_TOOLS: readonly ToolSummary[] = [
  coreTool('core_mcpserver_list', 'List the MCP servers muster aggregates.'),
  coreTool('core_mcpserver_get', 'Get one MCP server by its name.', 'name'),
  coreTool('core_workflow_list', 'List the workflows muster offers.'),
  coreTool('core_workflow_get', 'Get one workflow by its name.', 'name'),
  coreTool('core_auth_login', 'Sign in to an MCP server.', 'server', false),
  coreTool('core_auth_logout', 'Sign out of an MCP server.', 'server', false),
  connectorTool(
    'core_mcpserver_detect',
    'Detect the transport of an MCP server at a URL.',
    { url: { type: 'string', description: 'The server address.' } },
    ['url'],
  ),
  connectorTool(
    'core_mcpserver_validate',
    'Check an MCP server definition without saving it.',
    MCPSERVER_DEFINITION,
    ['name'],
  ),
  connectorTool(
    'core_mcpserver_create',
    'Register an MCP server.',
    {
      ...MCPSERVER_DEFINITION,
      clientCredentials: { type: 'object' },
      preset: APPROVAL_PRESET_ARGUMENT,
    },
    ['name'],
    false,
  ),
  connectorTool(
    'core_mcpserver_update',
    "Update an MCP server's description, display name, tags, autoStart, timeout, progress, suspended or restart.",
    definitionArguments(UPDATE_ARGUMENTS),
    ['name'],
    false,
  ),
  connectorTool(
    'core_mcpserver_connect',
    'Change where an MCP server is and how muster reaches it.',
    definitionArguments(CONNECT_ARGUMENTS),
    ['name'],
    false,
  ),
  connectorTool(
    'core_mcpserver_set_approval',
    "Set an MCP server's tool approval: explicit settings or a preset.",
    {
      name: { type: 'string', description: "The server's name." },
      approval: {
        type: 'object',
        description:
          'rule (Allow, Ask or Block) and tools (tool name to Allow, Ask or Block).',
        properties: {
          rule: { type: 'string', enum: ['Allow', 'Ask', 'Block'] },
          tools: {
            type: 'object',
            additionalProperties: {
              type: 'string',
              enum: ['Allow', 'Ask', 'Block'],
            },
          },
        },
      },
      preset: APPROVAL_PRESET_ARGUMENT,
      expectedGeneration: {
        type: 'integer',
        description:
          'The generation core_mcpserver_get returned; the write is refused when the server changed since.',
      },
    },
    ['name'],
    false,
  ),
  coreTool('core_mcpserver_delete', 'Delete an MCP server.', 'name', false),
  coreTool('core_service_start', 'Start or activate a service.', 'name', false),
  coreTool(
    'core_service_stop',
    'Stop and deactivate a service.',
    'name',
    false,
  ),
  coreTool('core_service_restart', 'Restart a service.', 'name', false),
];

/**
 * One of muster's tools for connector definitions, described with the
 * arguments the New connector flow reads from its schema. Fixture mode
 * answers each (`musterCoreTools.ts`).
 */
function connectorTool(
  name: string,
  description: string,
  properties: Record<string, JsonSchema>,
  required: string[],
  readOnly = true,
): ToolSummary {
  return {
    name,
    summary: description,
    description,
    kind: 'core',
    annotations: { readOnlyHint: readOnly },
    inputSchema: { type: 'object', properties, required },
  };
}

function coreTool(
  name: string,
  description: string,
  arg?: string,
  readOnly = true,
): ToolSummary {
  const properties: Record<string, JsonSchema> = arg
    ? { [arg]: { type: 'string', description: `The ${arg}'s name.` } }
    : {};
  return {
    name,
    summary: description,
    description,
    kind: 'core',
    annotations: { readOnlyHint: readOnly },
    inputSchema: { type: 'object', properties, required: arg ? [arg] : [] },
  };
}

/**
 * A workflow's arguments: what its Workflow object declares, and what its
 * `workflow_<name>` tool's input schema offers.
 */
const WORKFLOW_ARGS: Record<string, WorkflowArgDefinition> = {
  target: {
    type: 'string',
    required: true,
    description: 'What the workflow works on.',
  },
  dryRun: {
    type: 'boolean',
    default: false,
    description: 'Report what would change without changing it.',
  },
};

/** {@link WORKFLOW_ARGS} as the input schema muster derives from them. */
function workflowInputSchema(): JsonSchema {
  return {
    type: 'object',
    properties: Object.fromEntries(
      Object.entries(WORKFLOW_ARGS).map(([name, arg]) => [
        name,
        {
          type: arg.type,
          description: arg.description,
          ...(arg.default !== undefined && { default: arg.default }),
        },
      ]),
    ),
    required: Object.entries(WORKFLOW_ARGS)
      .filter(([, arg]) => arg.required)
      .map(([name]) => name),
  };
}

/**
 * A workflow as muster holds it: the data set's record, with the tools its
 * steps call, fixed when it was written ({@link musterWorkflowOf}). Whether
 * it is available follows from what the connectors serve now
 * ({@link isWorkflowAvailable}), not from the record's `state`.
 */
export type MusterFixtureWorkflow = FixtureWorkflow & {
  stepTools: readonly string[];
};

/** The tools the serving connectors offer now, by name. */
export type ServedTools = ReadonlyMap<string, ToolSummary>;

/** {@link ServedTools} of an installation's connectors. */
export function servedToolsOf(
  connectors: readonly MusterFixtureConnector[],
): ServedTools {
  return new Map(
    connectors
      .filter(isServing)
      .flatMap(connector =>
        connectorToolsOf(connector)
          .map(tool => withApprovalOf(tool, connector))
          // muster hides a blocked tool from every listing.
          .filter(tool => tool.approval?.setting !== 'block'),
      )
      .map(tool => [tool.name, tool]),
  );
}

/** A connector tool's own name, its settings' key. */
function approvalToolKeyOf(
  tool: ToolSummary,
  connector: MusterFixtureConnector,
): string {
  return approvalKeyOf(tool.name, `x_${toolSegmentOf(connector)}`);
}

/**
 * A served tool with its approval as muster reports it (tool approval,
 * slice 1): its own entry, else the connector's rule (*New*), else `allow`,
 * not reviewed. The guest administers muster's own connectors, never an
 * organization's.
 */
function withApprovalOf(
  tool: ToolSummary,
  connector: MusterFixtureConnector,
): ToolSummary {
  const { approval } = connector;
  let reported: ToolSummary['approval'] = {
    setting: 'allow',
    source: 'unreviewed',
  };
  if (approval) {
    const entry = approval.tools?.[approvalToolKeyOf(tool, connector)];
    const lower = (value: string | undefined) =>
      value === 'Allow' || value === 'Block'
        ? (value.toLowerCase() as 'allow' | 'block')
        : 'ask';
    reported =
      entry !== undefined
        ? { setting: lower(entry), source: 'tool' }
        : {
            setting:
              approval.rule === undefined ? 'allow' : lower(approval.rule),
            source: 'connector',
            new: true,
          };
  }
  return {
    ...tool,
    approval: {
      ...reported,
      ...(reported.setting === 'ask' &&
        connector.approvalUnavailable && {
          unavailable: connector.approvalUnavailable,
        }),
    },
    connectorAdmin: connector.namespace === undefined && !connector.notEditor,
  };
}

/** A preset written out for a connector's tools, as muster expands it on save. */
export function presetApprovalOf(
  preset: ApprovalPreset,
  connector: MusterFixtureConnector,
): MCPServerApproval {
  return expandPreset(
    preset,
    connectorToolsOf(connector).map(tool => ({
      key: approvalToolKeyOf(tool, connector),
      readOnly: tool.annotations?.readOnlyHint === true,
    })),
  );
}

/**
 * The settings of the one connector per installation the data set starts
 * reviewed: *Recommended*, its delete tools blocked, its last tool without
 * an entry (*New*, following the rule).
 */
export function reviewedApprovalOf(
  connector: MusterFixtureConnector,
): MCPServerApproval {
  const recommended = presetApprovalOf('recommended', connector);
  const tools = connectorToolsOf(connector);
  const entries = Object.fromEntries(
    tools.slice(0, -1).map(tool => {
      const key = approvalToolKeyOf(tool, connector);
      return [
        key,
        tool.annotations?.destructiveHint ? 'Block' : recommended.tools![key],
      ];
    }),
  );
  return { rule: 'Ask', tools: entries };
}

/**
 * A workflow with its steps, written against the data set's connectors: the
 * first tools of the installation's serving connectors, so its page links to
 * tools that exist. One the data set makes unavailable also calls a tool no
 * connector offers, last, which is why muster flags it.
 */
export function musterWorkflowOf(
  workflow: FixtureWorkflow,
  connectors: readonly FixtureConnector[],
): MusterFixtureWorkflow {
  const stepTools = connectors
    .filter(
      connector =>
        connector.installation === workflow.installation &&
        isServing(connector),
    )
    .flatMap(connector => connectorToolsOf(connector).slice(0, 2))
    .slice(0, 3)
    .map(tool => tool.name);
  return {
    ...workflow,
    stepTools:
      workflow.state === 'available'
        ? stepTools
        : [...stepTools, `x_retired_${workflow.name.replace(/-/g, '_')}`],
  };
}

/** One step of a fixture workflow: the tool it calls, if a connector offers it. */
type FixtureWorkflowStep = { tool: string; summary?: ToolSummary };

/** A workflow's steps, each with its tool if a serving connector offers it. */
function workflowStepsOf(
  workflow: MusterFixtureWorkflow,
  served: ServedTools,
): FixtureWorkflowStep[] {
  return workflow.stepTools.map(tool => ({ tool, summary: served.get(tool) }));
}

/**
 * Whether a workflow is available: every tool its steps call is served, as
 * muster validates it. A deleted, deactivated or failing connector makes the
 * workflows that call its tools unavailable.
 */
export function isWorkflowAvailable(
  workflow: MusterFixtureWorkflow,
  served: ServedTools,
): boolean {
  return workflow.stepTools.every(tool => served.has(tool));
}

/** A workflow as `/workflows` lists it. */
export function workflowListItemOf(
  workflow: MusterFixtureWorkflow,
  served: ServedTools,
): WorkflowListItem {
  return {
    name: workflow.name,
    description: workflow.description,
    available: isWorkflowAvailable(workflow, served),
  };
}

/**
 * A step's arguments: the workflow's `target` for each argument the tool
 * requires, so they match the schema of the tool the step calls.
 */
function stepArgsOf(step: FixtureWorkflowStep): Record<string, unknown> {
  const required = step.summary?.inputSchema?.required ?? [];
  return Object.fromEntries(
    required.map(name => [name, '{{ .input.target }}']),
  );
}

/**
 * A workflow as muster's catalogue lists it, `workflow_<name>`, with the
 * input schema of its arguments, read-only where every step's tool is, as
 * muster derives it. muster lists available workflows only.
 */
export function workflowToolOf(
  workflow: MusterFixtureWorkflow,
  served: ServedTools,
): ToolSummary {
  return {
    name: `workflow_${workflow.name}`,
    summary: workflow.description,
    description: workflow.description,
    kind: 'workflow',
    annotations: {
      readOnlyHint: workflowStepsOf(workflow, served).every(
        step => step.summary?.annotations?.readOnlyHint === true,
      ),
    },
    inputSchema: workflowInputSchema(),
  };
}

/** A workflow as the `Workflow` object the muster pages list. */
export function musterWorkflowObjectOf(
  workflow: MusterFixtureWorkflow,
  served: ServedTools,
): MusterWorkflow['jsonData'] {
  const steps = workflowStepsOf(workflow, served);
  const tools = steps.map(step => step.tool);
  const missing = steps.flatMap((step, index) =>
    step.summary ? [] : [{ index, tool: step.tool }],
  );
  const valid = missing.length === 0;
  return {
    apiVersion: 'muster.giantswarm.io/v1alpha1',
    kind: 'Workflow',
    metadata: {
      name: workflow.name,
      namespace: FIXTURE_MUSTER_NAMESPACE,
      labels: {
        ...(workflow.category && {
          [WORKFLOW_CATEGORY_LABEL]: workflow.category,
        }),
        ...(workflow.gitops && { 'app.kubernetes.io/managed-by': 'Helm' }),
      },
      ...(workflow.tags.length > 0 && {
        annotations: { [TAGS_ANNOTATION]: workflow.tags.join(',') },
      }),
    },
    spec: {
      description: workflow.description,
      args: WORKFLOW_ARGS,
      steps: steps.map((step, index) => ({
        id: `step-${index + 1}`,
        tool: step.tool,
        args: stepArgsOf(step),
        store: true,
      })),
    },
    status: {
      valid,
      ...(!valid && {
        validationErrors: missing.map(
          ({ index, tool }) =>
            `Step ${index + 1} calls ${tool}, which no connector offers.`,
        ),
      }),
      referencedTools: tools,
      stepCount: tools.length,
    },
  };
}

/**
 * How many of its workflow's steps a run walked, as muster lists only the
 * steps it started: every one it could complete when it completed, else up
 * to the step it failed in or is running. No run completes a step whose tool
 * no connector serves: a completed run stops before the first such step, and
 * a failed one may fail in it.
 */
export function stepsRunOf(
  execution: FixtureExecution,
  workflow: MusterFixtureWorkflow | undefined,
  served: ServedTools,
): number {
  const steps = workflow ? workflow.stepTools.length : execution.stepCount;
  const firstMissing = workflow
    ? workflow.stepTools.findIndex(tool => !served.has(tool))
    : -1;
  const completable = firstMissing === -1 ? steps : firstMissing;
  const walked = {
    completed: completable,
    failed: Math.min(execution.stepCount, steps),
    inprogress: Math.min(execution.stepCount, completable),
  }[execution.state];
  return Math.max(1, walked);
}

/**
 * Why a failed run failed, naming the step it failed in: the tool no
 * connector offers, or the data set's reason.
 */
function executionErrorOf(
  execution: FixtureExecution,
  step: number,
  tool: FixtureWorkflowStep | undefined,
): string | undefined {
  if (execution.state !== 'failed') {
    return undefined;
  }
  const reason =
    tool && !tool.summary
      ? `no connector offers ${tool.tool}.`
      : (execution.error ?? '').replace(/^Step \d+ failed: /, '');
  return `Step ${step} failed: ${reason}`;
}

/**
 * An execution as `/executions` lists it, with its workflow's steps
 * ({@link stepsRunOf}) when the workflow is known.
 */
export function executionSummaryOf(
  execution: FixtureExecution,
  workflow?: MusterFixtureWorkflow,
  served: ServedTools = new Map(),
): WorkflowExecutionSummary {
  const run = workflow ? executionOf(execution, workflow, served) : undefined;
  const error = run ? run.error : execution.error;
  return {
    execution_id: execution.id,
    workflow_name: execution.workflow,
    status: execution.state,
    started_at: execution.startedAt,
    ...(execution.completedAt && { completed_at: execution.completedAt }),
    duration_ms: execution.durationMs,
    step_count: run?.steps?.length ?? execution.stepCount,
    ...(error && { error }),
  };
}

/**
 * An execution with its steps, as `/executions/<id>` reports it: the steps
 * its workflow runs, in turn ({@link stepsRunOf}); a failed run's last step
 * failed, and its error names that step; a run in progress has its last step
 * running.
 */
export function executionOf(
  execution: FixtureExecution,
  workflow: MusterFixtureWorkflow | undefined,
  served: ServedTools,
): WorkflowExecution {
  const tools: FixtureWorkflowStep[] = workflow
    ? workflowStepsOf(workflow, served)
    : [
        {
          tool: 'core_mcpserver_list',
          summary: FIXTURE_CORE_TOOLS.find(
            t => t.name === 'core_mcpserver_list',
          ),
        },
      ];
  const stepCount = stepsRunOf(execution, workflow, served);
  const error = executionErrorOf(
    execution,
    stepCount,
    tools[(stepCount - 1) % tools.length],
  );
  const started = Date.parse(execution.startedAt);
  const stepMs = Math.floor(execution.durationMs / stepCount);
  const steps: WorkflowExecutionStep[] = Array.from(
    { length: stepCount },
    (_, index) => {
      const last = index === stepCount - 1;
      const status = last ? execution.state : 'completed';
      const step = tools[index % tools.length];
      const stepStart = new Date(started + index * stepMs).toISOString();
      return {
        step_id: `step-${index + 1}`,
        tool: step.tool,
        status,
        started_at: stepStart,
        ...(status !== 'inprogress' && {
          completed_at: new Date(started + (index + 1) * stepMs).toISOString(),
        }),
        duration_ms: stepMs,
        input: stepArgsOf(step),
        ...(status === 'completed' && { result: { items: index + 1 } }),
        ...(status === 'failed' && { error }),
        stored_as: `step-${index + 1}`,
      };
    },
  );
  return {
    execution_id: execution.id,
    workflow_name: execution.workflow,
    status: execution.state,
    started_at: execution.startedAt,
    ...(execution.completedAt && { completed_at: execution.completedAt }),
    duration_ms: execution.durationMs,
    input: { target: 'example', dryRun: false },
    ...(execution.state === 'completed' && {
      result: { changed: stepCount },
    }),
    ...(error && { error }),
    steps,
  };
}

/** A workflow's run statistics over its executions, as `/stats` derives them. */
export function workflowStatsOf(
  name: string,
  executions: readonly FixtureExecution[],
): WorkflowStats {
  const runs = executions.filter(execution => execution.workflow === name);
  const count = (state: FixtureExecution['state']) =>
    runs.filter(run => run.state === state).length;
  const completed = count('completed');
  const failed = count('failed');
  const finished = runs.filter(run => run.state !== 'inprogress');
  const durations = finished.map(run => run.durationMs);
  const days = new Map<string, { completed: number; failed: number }>();
  for (const run of finished) {
    const date = run.startedAt.slice(0, 10);
    const day = days.get(date) ?? { completed: 0, failed: 0 };
    if (run.state === 'completed') {
      day.completed++;
    } else {
      day.failed++;
    }
    days.set(date, day);
  }
  return {
    workflow_name: name,
    runs: runs.length,
    sampled: runs.length,
    completed,
    failed,
    inprogress: count('inprogress'),
    success_rate:
      completed + failed > 0 ? completed / (completed + failed) : null,
    avg_duration_ms: durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null,
    max_duration_ms: durations.length ? Math.max(...durations) : null,
    per_day: [...days]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, day]) => ({ date, ...day })),
  };
}

/** A small number that stays the same for the same text (FNV-1a). */
function stable(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  }
  return hash >>> 0;
}

const HOUR = 60 * 60 * 1000;

/** How a tool is used: calls an hour, the share that fails, its p95. */
function toolUsage(tool: string) {
  const hash = stable(tool);
  return {
    perHour: 1 + (hash % 60),
    errorRatio: hash % 7 === 0 ? 0.08 : 0.01,
    p95: 0.05 + (hash % 300) / 100,
  };
}

/** What a usage read narrows to: some MCP servers, or one tool. */
export type FixtureUsageScope = {
  hours: number;
  servers?: readonly string[];
  tool?: string;
  /** The end of the window, in ms. */
  now: number;
};

function usedTools(
  tools: readonly ToolSummary[],
  scope: FixtureUsageScope,
): ToolSummary[] {
  return tools.filter(
    tool =>
      (!scope.servers ||
        (tool.server !== undefined && scope.servers.includes(tool.server))) &&
      (!scope.tool || tool.name === scope.tool),
  );
}

/**
 * MCP usage over a window, as `/usage` derives it from muster's metrics: each
 * tool called at its own rate, a few with errors, busier in some hours than
 * others. The buckets cover the window exactly (the last one may be shorter),
 * and the rows and totals add up the same calls. Narrowed to some servers,
 * every tool they were called with is listed and the server rows carry their
 * p95; narrowed to one tool, its row carries its p95.
 */
export function mcpUsageOf(
  tools: readonly ToolSummary[],
  scope: FixtureUsageScope,
): McpUsage {
  let step = 24;
  if (scope.hours <= 24) {
    step = 1;
  } else if (scope.hours <= 168) {
    step = 6;
  }
  const end = Math.floor(scope.now / HOUR) * HOUR;
  const start = end - scope.hours * HOUR;
  const bucketHours = Array.from(
    { length: Math.ceil(scope.hours / step) },
    (_, index) => Math.min(step, scope.hours - index * step),
  );
  const loads = bucketHours.map(
    (_, index) => 0.5 + 0.5 * Math.abs(Math.sin(index / 3)),
  );
  // Each tool's calls and errors in each bucket: what the buckets, the rows
  // and the totals all add up.
  const used = usedTools(tools, scope).map(tool => {
    const usage = toolUsage(tool.name);
    const calls = bucketHours.map((hours, index) =>
      Math.round(usage.perHour * hours * loads[index]),
    );
    const errors = calls.map(count => Math.round(count * usage.errorRatio));
    return { tool, p95: usage.p95, calls, errors };
  });
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  const buckets: McpUsageBucket[] = bucketHours.map((_, index) => {
    const calls = sum(used.map(u => u.calls[index]));
    const errors = sum(used.map(u => u.errors[index]));
    return {
      start: new Date(start + index * step * HOUR).toISOString(),
      ok: calls - errors,
      error: Math.floor(errors / 2),
      error_result: errors - Math.floor(errors / 2),
    };
  });
  const rows = used
    .map(u => ({
      tool: u.tool.name,
      server: u.tool.server,
      calls: sum(u.calls),
      errors: sum(u.errors),
      p95: u.p95,
    }))
    .sort((a, b) => b.calls - a.calls || a.tool.localeCompare(b.tool));
  const servers = new Map<
    string,
    { calls: number; errors: number; p95: number }
  >();
  for (const row of rows) {
    if (row.server) {
      const server = servers.get(row.server) ?? { calls: 0, errors: 0, p95: 0 };
      server.calls += row.calls;
      server.errors += row.errors;
      server.p95 = Math.max(server.p95, row.p95);
      servers.set(row.server, server);
    }
  }
  const calls = sum(rows.map(row => row.calls));
  const errors = sum(rows.map(row => row.errors));
  const narrowed = scope.servers !== undefined || scope.tool !== undefined;
  return {
    available: true,
    source: { server: 'prometheus', tool: 'x_prometheus_execute_range_query' },
    range_hours: scope.hours,
    step_hours: step,
    buckets,
    totals: {
      calls,
      errors,
      error_ratio: calls > 0 ? errors / calls : null,
      p95_seconds: rows.length ? Math.max(...rows.map(row => row.p95)) : null,
      distinct_tools: rows.length,
    },
    top_tools: (scope.servers ? rows : rows.slice(0, 15)).map(row => ({
      tool: row.tool,
      calls: row.calls,
      errors: row.errors,
      p95_seconds: scope.tool ? row.p95 : null,
    })),
    servers: [...servers]
      .sort(([, a], [, b]) => b.calls - a.calls)
      .map(([server, row]) => ({
        server,
        calls: row.calls,
        errors: row.errors,
        p95_seconds: narrowed ? row.p95 : null,
      })),
  };
}

/** Every used tool's p95 over a window, as `/usage/tool-latency` reports it. */
export function mcpToolLatencyOf(
  tools: readonly ToolSummary[],
  scope: FixtureUsageScope,
): McpToolLatency {
  return {
    available: true,
    range_hours: scope.hours,
    tools: usedTools(tools, scope).map(tool => ({
      tool: tool.name,
      p95_seconds: toolUsage(tool.name).p95,
    })),
  };
}
