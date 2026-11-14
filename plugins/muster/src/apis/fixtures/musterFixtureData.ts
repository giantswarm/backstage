import type { ConnectorName } from '@giantswarm/backstage-plugin-gs-common';
import type {
  ConnectorState,
  FixtureConnector,
  FixtureExecution,
  FixtureInstallation,
  FixtureWorkflow,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import { MUSTER_NAMESPACE } from '../../components/MusterInstanceProvider/useMusterResources';
import type {
  MCPServer,
  MCPServerCondition,
  MCPServerState,
} from '../../lib/k8s/MCPServer';
import type { MusterWorkflow } from '../../lib/k8s/MusterWorkflow';
import type {
  JsonSchema,
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
      namespace: FIXTURE_MUSTER_NAMESPACE,
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
  connector: FixtureConnector,
): McpServerRuntime {
  return {
    name: connector.name,
    namespace: FIXTURE_MUSTER_NAMESPACE,
    displayName: connector.displayName,
    toolPrefix: connector.name,
    type: 'streamable-http',
    state: connector.state,
    ...(CONNECTED.has(connector.state) && {
      sessionStatus: 'connected',
      toolsCount: connector.toolsCount,
    }),
    ...(FAILING.has(connector.state) && {
      error: READY[connector.state].message,
      consecutiveFailures: 3,
    }),
  };
}

/** A connector as `/servers/names` names it. */
export function connectorNameOf(connector: FixtureConnector): ConnectorName {
  return { name: connector.name, displayName: connector.displayName };
}

/** A workflow as `/workflows` lists it. */
export function workflowListItemOf(
  workflow: FixtureWorkflow,
): WorkflowListItem {
  return {
    name: workflow.name,
    description: workflow.description,
    available: workflow.state === 'available',
  };
}

/** An execution as `/executions` lists it. */
export function executionSummaryOf(
  execution: FixtureExecution,
  stepCount = execution.stepCount,
): WorkflowExecutionSummary {
  return {
    execution_id: execution.id,
    workflow_name: execution.workflow,
    status: execution.state,
    started_at: execution.startedAt,
    ...(execution.completedAt && { completed_at: execution.completedAt }),
    duration_ms: execution.durationMs,
    step_count: stepCount,
    ...(execution.error && { error: execution.error }),
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
 * the connector's name (`mcpServerObjectOf`). Derived from the connector
 * alone, so every read names the same tools.
 */
export function connectorToolsOf(connector: FixtureConnector): ToolSummary[] {
  return Array.from({ length: connector.toolsCount }, (_, index) => {
    const verb = TOOL_VERBS[index % TOOL_VERBS.length];
    const noun =
      TOOL_NOUNS[Math.floor(index / TOOL_VERBS.length) % TOOL_NOUNS.length];
    const round = Math.floor(index / (TOOL_VERBS.length * TOOL_NOUNS.length));
    const tool = `${verb}_${noun}${round > 0 ? `_${round + 1}` : ''}`;
    const description = `${verb[0].toUpperCase()}${verb.slice(1)} the ${noun} of ${connector.displayName}.`;
    const byName = verb !== 'list' && verb !== 'search' && verb !== 'create';
    return {
      name: `x_${connector.name}_${tool}`,
      summary: description,
      description,
      server: connector.name,
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
      server: connector.name,
    },
    {
      uri: `${connector.name}://config/limits`,
      name: 'Limits',
      description: 'The rate limits that apply to this connector.',
      mimeType: 'application/json',
      server: connector.name,
    },
  ];
}

/** A serving connector's prompts, as `filter_prompts` lists them. */
export function connectorPromptsOf(
  connector: FixtureConnector,
): PromptSummary[] {
  if (!isServing(connector)) {
    return [];
  }
  return [
    {
      name: `x_${connector.name}_summarize`,
      description: `Summarize what changed in ${connector.displayName} today.`,
      server: connector.name,
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
  const name = connector.name;
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
];

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

const WORKFLOW_TARGET_ARG = {
  type: 'string',
  description: 'What the workflow works on.',
};

/**
 * A workflow as muster's catalogue lists it, `workflow_<name>`, read-only
 * where every step's tool is, as muster derives it.
 */
export function workflowToolOf(
  workflow: FixtureWorkflow,
  connectors: readonly FixtureConnector[],
): ToolSummary {
  const readOnly = new Set(
    connectors
      .filter(isServing)
      .flatMap(connectorToolsOf)
      .filter(tool => tool.annotations?.readOnlyHint)
      .map(tool => tool.name),
  );
  return {
    name: `workflow_${workflow.name}`,
    summary: workflow.description,
    description: workflow.description,
    kind: 'workflow',
    annotations: {
      readOnlyHint: workflowStepToolsOf(workflow, connectors).every(tool =>
        readOnly.has(tool),
      ),
    },
    inputSchema: {
      type: 'object',
      properties: { target: WORKFLOW_TARGET_ARG },
      required: ['target'],
    },
  };
}

/**
 * The tools a workflow's steps call: the first tools of the installation's
 * serving connectors, so its page links to tools that exist. One that is
 * not available also calls a tool no connector offers, which is why muster
 * flags it.
 */
export function workflowStepToolsOf(
  workflow: FixtureWorkflow,
  connectors: readonly FixtureConnector[],
): string[] {
  const tools = connectors
    .filter(
      connector =>
        connector.installation === workflow.installation &&
        isServing(connector),
    )
    .flatMap(connector => connectorToolsOf(connector).slice(0, 2))
    .map(tool => tool.name)
    .slice(0, 3);
  return workflow.state === 'available'
    ? tools
    : [...tools, `x_retired_${workflow.name.replace(/-/g, '_')}`];
}

/** A workflow as the `Workflow` object the muster pages list. */
export function musterWorkflowObjectOf(
  workflow: FixtureWorkflow,
  connectors: readonly FixtureConnector[],
): MusterWorkflow['jsonData'] {
  const tools = workflowStepToolsOf(workflow, connectors);
  const valid = workflow.state === 'available';
  return {
    apiVersion: 'muster.giantswarm.io/v1alpha1',
    kind: 'Workflow',
    metadata: {
      name: workflow.name,
      namespace: FIXTURE_MUSTER_NAMESPACE,
    },
    spec: {
      description: workflow.description,
      args: {
        target: { ...WORKFLOW_TARGET_ARG, required: true },
        dryRun: {
          type: 'boolean',
          default: false,
          description: 'Report what would change without changing it.',
        },
      },
      steps: tools.map((tool, index) => ({
        id: `step-${index + 1}`,
        tool,
        args: { name: '{{ .input.target }}' },
        store: true,
      })),
    },
    status: {
      valid,
      ...(!valid && {
        validationErrors: [
          `Step ${tools.length} calls ${tools[tools.length - 1]}, which no connector offers.`,
        ],
      }),
      referencedTools: tools,
      stepCount: tools.length,
    },
  };
}

/**
 * How many of its workflow's steps a run walked: every one when it
 * completed, else up to the step it failed in or is running, as muster lists
 * only the steps it started.
 */
export function stepsRunOf(
  execution: FixtureExecution,
  workflow: FixtureWorkflow | undefined,
  connectors: readonly FixtureConnector[],
): number {
  const steps = workflow
    ? workflowStepToolsOf(workflow, connectors).length
    : execution.stepCount;
  return execution.state === 'completed'
    ? steps
    : Math.min(execution.stepCount, steps);
}

/**
 * An execution with its steps, as `/executions/<id>` reports it: the steps
 * its workflow runs, in turn ({@link stepsRunOf}); a failed run's last step
 * failed, a run in progress has its last step running.
 */
export function executionOf(
  execution: FixtureExecution,
  workflow: FixtureWorkflow | undefined,
  connectors: readonly FixtureConnector[],
): WorkflowExecution {
  const tools = workflow
    ? workflowStepToolsOf(workflow, connectors)
    : ['core_mcpserver_list'];
  const stepCount = stepsRunOf(execution, workflow, connectors);
  const started = Date.parse(execution.startedAt);
  const stepMs = Math.floor(execution.durationMs / stepCount);
  const steps: WorkflowExecutionStep[] = Array.from(
    { length: stepCount },
    (_, index) => {
      const last = index === stepCount - 1;
      const status = last ? execution.state : 'completed';
      const stepStart = new Date(started + index * stepMs).toISOString();
      return {
        step_id: `step-${index + 1}`,
        tool: tools[index % tools.length],
        status,
        started_at: stepStart,
        ...(status !== 'inprogress' && {
          completed_at: new Date(started + (index + 1) * stepMs).toISOString(),
        }),
        duration_ms: stepMs,
        input: { name: 'example' },
        ...(status === 'completed' && { result: { items: index + 1 } }),
        ...(status === 'failed' && { error: execution.error }),
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
    input: { target: 'example' },
    ...(execution.state === 'completed' && {
      result: { changed: stepCount },
    }),
    ...(execution.error && { error: execution.error }),
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
 * tool called at its own steady rate, a few with errors, busier in some
 * hours than others. Narrowed to some servers, every tool they were called
 * with is listed and the server rows carry their p95; narrowed to one tool,
 * its row carries its p95.
 */
export function mcpUsageOf(
  tools: readonly ToolSummary[],
  scope: FixtureUsageScope,
): McpUsage {
  const used = usedTools(tools, scope).map(tool => ({
    tool,
    ...toolUsage(tool.name),
  }));
  let step = 24;
  if (scope.hours <= 24) {
    step = 1;
  } else if (scope.hours <= 168) {
    step = 6;
  }
  const end = Math.floor(scope.now / HOUR) * HOUR;
  const bucketCount = Math.ceil(scope.hours / step);
  const buckets: McpUsageBucket[] = Array.from(
    { length: bucketCount },
    (_, index) => {
      const load = 0.5 + 0.5 * Math.abs(Math.sin(index / 3));
      const calls = used.reduce(
        (sum, { perHour }) => sum + Math.round(perHour * step * load),
        0,
      );
      const errors = used.reduce(
        (sum, { perHour, errorRatio }) =>
          sum + Math.round(perHour * step * load * errorRatio),
        0,
      );
      return {
        start: new Date(
          end - (bucketCount - index) * step * HOUR,
        ).toISOString(),
        ok: calls - errors,
        error: Math.floor(errors / 2),
        error_result: errors - Math.floor(errors / 2),
      };
    },
  );
  const rows = used
    .map(({ tool, perHour, errorRatio, p95 }) => {
      const calls = perHour * scope.hours;
      return {
        tool: tool.name,
        server: tool.server,
        calls,
        errors: Math.round(calls * errorRatio),
        p95,
      };
    })
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
  const calls = rows.reduce((sum, row) => sum + row.calls, 0);
  const errors = rows.reduce((sum, row) => sum + row.errors, 0);
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
