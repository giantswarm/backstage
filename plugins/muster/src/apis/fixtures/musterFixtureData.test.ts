import {
  CONNECTOR_STATES,
  createFixtureDataSet,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import {
  MCPServer,
  mcpServerStateSeverity,
  type MCPServerState,
} from '../../lib/k8s/MCPServer';
import { isGitOpsManaged } from '../../lib/gitops';
import { MusterWorkflow } from '../../lib/k8s/MusterWorkflow';
import {
  connectorNameOf,
  connectorToolsOf,
  executionOf,
  executionSummaryOf,
  musterWorkflowObjectOf,
  mcpServerObjectOf,
  mcpServerRuntimeOf,
  musterInstallationOf,
  musterWorkflowOf,
  servedToolsOf,
  workflowListItemOf,
  workflowToolOf,
} from './musterFixtureData';

const data = createFixtureDataSet({ now: Date.parse('2026-11-14T12:00:00Z') });
/** The data set's workflows, their steps written against its connectors. */
const workflows = data.workflows.map(workflow =>
  musterWorkflowOf(workflow, data.connectors),
);
/** What the data set's serving connectors offer. */
const served = servedToolsOf(data.connectors);

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
    for (const workflow of workflows) {
      expect(workflowListItemOf(workflow, served)).toEqual({
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

  it('names a connector’s tools and prompts after its tool prefix when it has one', () => {
    const connector = { ...data.connectors[0], toolPrefix: 'orch' };
    for (const tool of connectorToolsOf(connector)) {
      expect(tool.name.startsWith('x_orch_')).toBe(true);
      expect(tool.server).toBe(connector.name);
    }
  });

  it('flags a workflow whose steps call a tool no connector serves any more', () => {
    const record = workflows.find(
      w => w.state === 'available' && w.stepTools.length > 0,
    )!;
    const [first] = record.stepTools;
    const gone = new Map([...served].filter(([name]) => name !== first));

    expect(workflowListItemOf(record, gone).available).toBe(false);
    const workflow = new MusterWorkflow(
      musterWorkflowObjectOf(record, gone),
      record.installation,
    );
    expect(workflow.isValid()).toBe(false);
    expect(workflow.getValidationErrors()).toEqual([
      `Step 1 calls ${first}, which no connector offers.`,
    ]);
  });

  it('maps workflows onto Workflow objects whose steps call served tools', () => {
    for (const record of workflows) {
      const workflow = new MusterWorkflow(
        musterWorkflowObjectOf(record, served),
        record.installation,
      );
      expect(workflow.getName()).toBe(record.name);
      expect(workflow.getDescription()).toBe(record.description);
      expect(workflow.getCategory()).toBe(record.category);
      expect(workflow.getTags()).toEqual(record.tags);
      expect(isGitOpsManaged(workflow)).toBe(record.gitops);
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
    for (const record of workflows) {
      const object = musterWorkflowObjectOf(record, served);
      const schema = workflowToolOf(record, served).inputSchema!;
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
    for (const record of workflows) {
      for (const step of musterWorkflowObjectOf(record, served).spec!.steps!) {
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
      const workflow = workflows.find(
        w =>
          w.name === execution.workflow &&
          w.installation === execution.installation,
      )!;
      const run = executionOf(execution, workflow, served);
      const missing = run.steps!.filter(step =>
        step.tool.startsWith('x_retired_'),
      );
      expect(missing.every(step => step.status === 'failed')).toBe(true);
      expect(
        missing.length === 0 || run.error?.includes('no connector offers'),
      ).toBe(true);
      expect(executionSummaryOf(execution, workflow, served)).toEqual(
        expect.objectContaining({ step_count: run.steps!.length }),
      );
    }
  });
});
