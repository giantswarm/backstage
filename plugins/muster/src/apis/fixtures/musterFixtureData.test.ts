import {
  CONNECTOR_STATES,
  createFixtureDataSet,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import {
  MCPServer,
  mcpServerStateSeverity,
  type MCPServerState,
} from '../../lib/k8s/MCPServer';
import {
  connectorNameOf,
  executionSummaryOf,
  mcpServerObjectOf,
  mcpServerRuntimeOf,
  musterInstallationOf,
  workflowListItemOf,
} from './musterFixtureData';

const data = createFixtureDataSet({ now: Date.parse('2026-11-14T12:00:00Z') });

/** Every state muster's CRD has; a missing key fails the build. */
const MUSTER_STATES: Record<MCPServerState, true> = {
  Running: true,
  Starting: true,
  Stopped: true,
  Connected: true,
  'Auth Required': true,
  'Awaiting Session': true,
  Connecting: true,
  Disconnected: true,
  Failed: true,
};

describe('muster fixture data', () => {
  it('has a connector in every state muster knows', () => {
    expect(new Set(CONNECTOR_STATES)).toEqual(
      new Set(Object.keys(MUSTER_STATES)),
    );
  });

  it('maps connectors onto MCPServer objects the pages read', () => {
    for (const connector of data.connectors) {
      const server = new MCPServer(
        mcpServerObjectOf(connector),
        connector.installation,
      );
      expect(server.getName()).toBe(connector.name);
      expect(server.getDisplayName()).toBe(connector.displayName);
      expect(server.getDescription()).toBe(connector.description);
      expect(server.getUrl()).toBe(connector.url);
      expect(server.getState()).toBe(connector.state);
      expect(server.getToolPrefix()).toBe(
        mcpServerRuntimeOf(connector).toolPrefix,
      );
      expect(server.getStateExplanation()).toEqual(expect.any(String));
      expect(mcpServerStateSeverity(server.getState())).not.toBe('unknown');
      expect(server.isServedPerSession()).toBe(
        connector.state === 'Awaiting Session',
      );
      expect(server.getAuth()?.type).toBe(
        ['Auth Required', 'Awaiting Session'].includes(connector.state)
          ? 'oauth'
          : undefined,
      );
    }
  });

  it('gives a failing connector an error and a serving one its tools', () => {
    for (const connector of data.connectors) {
      const runtime = mcpServerRuntimeOf(connector);
      expect(runtime).toMatchObject({
        name: connector.name,
        displayName: connector.displayName,
        state: connector.state,
      });
      const serving = ['Connected', 'Running'].includes(connector.state);
      expect(runtime.toolsCount).toBe(
        serving ? connector.toolsCount : undefined,
      );
      expect(runtime.error !== undefined).toBe(
        ['Disconnected', 'Failed'].includes(connector.state),
      );
      expect(connectorNameOf(connector)).toEqual({
        name: connector.name,
        displayName: connector.displayName,
      });
    }
  });

  it('maps installations onto what /installations reports', () => {
    expect(data.installations.map(musterInstallationOf)).toEqual([
      expect.objectContaining({ name: 'meadow', reachable: true }),
      expect.objectContaining({ name: 'fennel', reachable: true }),
      expect.objectContaining({
        name: 'tarragon',
        reachable: false,
        reason: 'timeout',
      }),
    ]);
  });

  it('maps workflows and their executions', () => {
    for (const workflow of data.workflows) {
      expect(workflowListItemOf(workflow)).toEqual({
        name: workflow.name,
        description: workflow.description,
        available: workflow.state === 'available',
      });
    }
    for (const execution of data.executions) {
      const summary = executionSummaryOf(execution);
      expect(summary).toMatchObject({
        execution_id: execution.id,
        workflow_name: execution.workflow,
        status: execution.state,
        step_count: execution.stepCount,
      });
      expect(summary.completed_at === undefined).toBe(
        execution.state === 'inprogress',
      );
      expect(summary.error === undefined).toBe(execution.state !== 'failed');
    }
  });
});
