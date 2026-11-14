import type { ConnectorName } from '@giantswarm/backstage-plugin-gs-common';
import type {
  ConnectorState,
  FixtureConnector,
  FixtureExecution,
  FixtureInstallation,
  FixtureWorkflow,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import type {
  MCPServer,
  MCPServerCondition,
  MCPServerState,
} from '../../lib/k8s/MCPServer';
import type {
  McpServerRuntime,
  MusterInstallationInfo,
  WorkflowExecutionSummary,
  WorkflowListItem,
} from '../types';

/**
 * The fixture data set's records as the muster plugin's clients read them
 * (docs/fixtures.md). Each function maps one record onto the type a client
 * returns, so a change to that type breaks the fixture's build.
 */

/** The namespace muster's own MCP servers live in. */
export const FIXTURE_MUSTER_NAMESPACE = 'muster';

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
): WorkflowExecutionSummary {
  return {
    execution_id: execution.id,
    workflow_name: execution.workflow,
    status: execution.state,
    started_at: execution.startedAt,
    ...(execution.completedAt && { completed_at: execution.completedAt }),
    duration_ms: execution.durationMs,
    step_count: execution.stepCount,
    ...(execution.error && { error: execution.error }),
  };
}
