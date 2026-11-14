import type { ConnectorName } from '@giantswarm/backstage-plugin-gs-common';
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
import type {
  MusterWorkflow,
  WorkflowArgDefinition,
} from '../../lib/k8s/MusterWorkflow';
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
      resourcesCount: connectorResourcesOf(connector).length,
      promptsCount: connectorPromptsOf(connector).length,
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

/** One step of a fixture workflow: the tool it calls, if a connector offers it. */
type FixtureWorkflowStep = { tool: string; summary?: ToolSummary };

/**
 * A workflow's steps: the first tools of the installation's serving
 * connectors, so its page links to tools that exist. One that is not
 * available also calls a tool no connector offers, last, which is why muster
 * flags it.
 */
function workflowStepsOf(
  workflow: FixtureWorkflow,
  connectors: readonly FixtureConnector[],
): FixtureWorkflowStep[] {
  const steps: FixtureWorkflowStep[] = connectors
    .filter(
      connector =>
        connector.installation === workflow.installation &&
        isServing(connector),
    )
    .flatMap(connector => connectorToolsOf(connector).slice(0, 2))
    .slice(0, 3)
    .map(summary => ({ tool: summary.name, summary }));
  return workflow.state === 'available'
    ? steps
    : [...steps, { tool: `x_retired_${workflow.name.replace(/-/g, '_')}` }];
}

/** The tools a workflow's steps call, in order. */
export function workflowStepToolsOf(
  workflow: FixtureWorkflow,
  connectors: readonly FixtureConnector[],
): string[] {
  return workflowStepsOf(workflow, connectors).map(step => step.tool);
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
  workflow: FixtureWorkflow,
  connectors: readonly FixtureConnector[],
): ToolSummary {
  return {
    name: `workflow_${workflow.name}`,
    summary: workflow.description,
    description: workflow.description,
    kind: 'workflow',
    annotations: {
      readOnlyHint: workflowStepsOf(workflow, connectors).every(
        step => step.summary?.annotations?.readOnlyHint === true,
      ),
    },
    inputSchema: workflowInputSchema(),
  };
}

/** A workflow as the `Workflow` object the muster pages list. */
export function musterWorkflowObjectOf(
  workflow: FixtureWorkflow,
  connectors: readonly FixtureConnector[],
): MusterWorkflow['jsonData'] {
  const steps = workflowStepsOf(workflow, connectors);
  const tools = steps.map(step => step.tool);
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
 * How many of its workflow's steps a run walked, as muster lists only the
 * steps it started: every one it could complete when it completed, else up
 * to the step it failed in or is running. An unavailable workflow's last
 * step calls a tool no connector offers, so no run completes it: a completed
 * run stops before it, and a failed one may fail in it.
 */
export function stepsRunOf(
  execution: FixtureExecution,
  workflow: FixtureWorkflow | undefined,
  connectors: readonly FixtureConnector[],
): number {
  const steps = workflow
    ? workflowStepsOf(workflow, connectors).length
    : execution.stepCount;
  const completable = workflow?.state === 'unavailable' ? steps - 1 : steps;
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
    tool && !tool.summary && tool.tool.startsWith('x_retired_')
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
  workflow?: FixtureWorkflow,
  connectors: readonly FixtureConnector[] = [],
): WorkflowExecutionSummary {
  const run = workflow
    ? executionOf(execution, workflow, connectors)
    : undefined;
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
  workflow: FixtureWorkflow | undefined,
  connectors: readonly FixtureConnector[],
): WorkflowExecution {
  const tools: FixtureWorkflowStep[] = workflow
    ? workflowStepsOf(workflow, connectors)
    : [{ tool: 'core_mcpserver_list' }];
  const stepCount = stepsRunOf(execution, workflow, connectors);
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
