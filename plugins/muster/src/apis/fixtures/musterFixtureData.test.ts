import {
  CONNECTOR_STATES,
  createFixtureDataSet,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import {
  MCPServer,
  mcpServerStateSeverity,
  type MCPServerState,
} from '../../lib/k8s/MCPServer';
import { MusterWorkflow } from '../../lib/k8s/MusterWorkflow';
import {
  connectorNameOf,
  connectorToolsOf,
  executionOf,
  executionSummaryOf,
  isServing,
  musterWorkflowObjectOf,
  mcpServerObjectOf,
  mcpServerRuntimeOf,
  musterInstallationOf,
  workflowListItemOf,
  workflowToolOf,
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

  it('names each connector’s tools apart, under its tool prefix', () => {
    for (const connector of data.connectors) {
      const tools = connectorToolsOf(connector);
      expect(tools).toHaveLength(connector.toolsCount);
      expect(new Set(tools.map(tool => tool.name)).size).toBe(tools.length);
      for (const tool of tools) {
        expect(tool.name.startsWith(`x_${connector.name}_`)).toBe(true);
        expect(tool.server).toBe(connector.name);
      }
    }
  });

  it('maps workflows onto Workflow objects whose steps call served tools', () => {
    const served = new Set(
      data.connectors
        .filter(isServing)
        .flatMap(connectorToolsOf)
        .map(tool => tool.name),
    );
    for (const record of data.workflows) {
      const workflow = new MusterWorkflow(
        musterWorkflowObjectOf(record, data.connectors),
        record.installation,
      );
      expect(workflow.getName()).toBe(record.name);
      expect(workflow.getDescription()).toBe(record.description);
      expect(workflow.isValid()).toBe(record.state === 'available');
      expect(workflow.getValidationErrors().length > 0).toBe(
        record.state !== 'available',
      );
      const tools = workflow.getSteps().map(step => step.tool!);
      expect(workflow.getReferencedTools()).toEqual(tools);
      expect(tools.filter(tool => !served.has(tool))).toHaveLength(
        record.state === 'available' ? 0 : 1,
      );
    }
  });

  it('offers a workflow’s tool the arguments its Workflow object declares', () => {
    for (const record of data.workflows) {
      const object = musterWorkflowObjectOf(record, data.connectors);
      const schema = workflowToolOf(record, data.connectors).inputSchema!;
      expect(Object.keys(schema.properties!)).toEqual(
        Object.keys(object.spec!.args!),
      );
      expect(schema.required).toEqual(
        Object.entries(object.spec!.args!)
          .filter(([, arg]) => arg.required)
          .map(([name]) => name),
      );
    }
  });

  it('gives each step exactly the arguments its tool requires', () => {
    const tools = new Map(
      data.connectors.flatMap(connectorToolsOf).map(t => [t.name, t]),
    );
    for (const record of data.workflows) {
      for (const step of musterWorkflowObjectOf(record, data.connectors).spec!
        .steps!) {
        const schema = tools.get(step.tool!)?.inputSchema;
        expect(Object.keys(step.args!)).toEqual(schema?.required ?? []);
        for (const name of Object.keys(step.args!)) {
          expect(schema!.properties).toHaveProperty(name);
        }
      }
    }
  });

  it('never runs an unavailable workflow’s missing tool to completion', () => {
    for (const execution of data.executions) {
      const workflow = data.workflows.find(
        w =>
          w.name === execution.workflow &&
          w.installation === execution.installation,
      )!;
      const run = executionOf(execution, workflow, data.connectors);
      const missing = run.steps!.filter(step =>
        step.tool.startsWith('x_retired_'),
      );
      expect(missing.every(step => step.status === 'failed')).toBe(true);
      expect(
        missing.length === 0 || run.error?.includes('no connector offers'),
      ).toBe(true);
      expect(executionSummaryOf(execution, workflow, data.connectors)).toEqual(
        expect.objectContaining({ step_count: run.steps!.length }),
      );
    }
  });
});
