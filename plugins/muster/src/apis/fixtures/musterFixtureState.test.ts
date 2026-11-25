import {
  baseDataSet,
  inInstallation,
  setFixtureScenarioForTests,
  type ConnectorState,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import { MCPServer } from '../../lib/k8s/MCPServer';
import { MusterWorkflow } from '../../lib/k8s/MusterWorkflow';
import { parseTransportDetection } from '../../lib/transportDetection';
import { musterKubernetesObjectsOf } from '.';
import {
  CONNECT_MS,
  MusterFixtureState,
  NEW_CONNECTOR_TOOLS,
} from './musterFixtureState';
import { FIXTURE_APPROVAL_UNAVAILABLE } from './musterFixtureData';
import { musterFixtureApi } from './MusterFixtureApi';

const INSTALLATION = 'meadow';

describe('the connector writes in fixture mode', () => {
  const api = musterFixtureApi([]);
  const connectors = inInstallation(baseDataSet().connectors, INSTALLATION);
  const named = (state: ConnectorState) =>
    connectors.find(connector => connector.state === state)!.name;

  const call = (tool: string, args: Record<string, unknown>) =>
    api.callTool(tool, args, INSTALLATION);
  const stateOf = async (name: string) =>
    (await api.listServers(INSTALLATION)).mcpServers?.find(
      server => server.name === name,
    )?.state;
  const objectOf = (name: string) => {
    const object = musterKubernetesObjectsOf(INSTALLATION).find(
      o => o.kind === 'MCPServer' && o.metadata.name === name,
    );
    return object
      ? new MCPServer(object as MCPServer['jsonData'], INSTALLATION)
      : undefined;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    setFixtureScenarioForTests(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    setFixtureScenarioForTests(undefined);
  });

  describe('tool approval', () => {
    const toolsOf = async (name: string) =>
      (
        await api.filterTools({
          installation: INSTALLATION,
          pattern: `x_${name}_*`,
          limit: 200,
        })
      ).tools ?? [];

    it('starts one connector reviewed: its settings, a hidden blocked tool and a New one', async () => {
      const name = named('Connected');
      const approval = objectOf(name)?.getApproval();
      expect(approval?.rule).toBe('Ask');
      expect(Object.values(approval?.tools ?? {})).toContain('Block');

      const tools = await toolsOf(name);
      expect(tools.every(tool => tool.connectorAdmin === true)).toBe(true);
      expect(tools.some(tool => tool.name.includes('_delete_'))).toBe(false);
      expect(tools.filter(tool => tool.approval?.new)).toHaveLength(1);
      expect(
        (await api.listServers(INSTALLATION)).mcpServers?.find(
          server => server.name === name,
        )?.approval,
      ).toEqual(approval);
    });

    it("reports why asking calls are refused on the second installation's muster only", async () => {
      const asking = (installation: string) =>
        api
          .filterTools({ installation, pattern: 'x_*', limit: 200 })
          .then(result =>
            (result.tools ?? []).filter(
              tool => tool.approval?.setting === 'ask',
            ),
          );

      const meadow = await asking(INSTALLATION);
      expect(meadow.length).toBeGreaterThan(0);
      expect(meadow.some(tool => tool.approval?.unavailable)).toBe(false);

      const fennel = await asking('fennel');
      expect(fennel.length).toBeGreaterThan(0);
      expect(
        fennel.every(
          tool => tool.approval?.unavailable === FIXTURE_APPROVAL_UNAVAILABLE,
        ),
      ).toBe(true);
      expect(
        fennel.every(tool => tool.approval?.source !== 'unavailable'),
      ).toBe(true);
    });

    it('sets the settings explicitly, and the next listing reports them', async () => {
      const name = named('Connected');
      const keys = Object.keys(objectOf(name)!.getApproval()!.tools!);
      await expect(
        call('core_mcpserver_set_approval', {
          name,
          approval: {
            rule: 'Allow',
            tools: Object.fromEntries(keys.map(key => [key, 'Allow'])),
          },
        }),
      ).resolves.toBe(`Approval of MCP server '${name}' updated successfully`);

      const tools = await toolsOf(name);
      // The blocked tool is listed again; the last one still follows the rule.
      expect(tools.some(tool => tool.name.includes('_delete_'))).toBe(true);
      expect(
        tools.filter(tool => tool.approval?.source === 'tool'),
      ).toHaveLength(keys.length);
      expect(tools.every(tool => tool.approval?.setting === 'allow')).toBe(
        true,
      );
    });

    it('refuses a setting muster does not know, and a call without settings', async () => {
      const name = named('Connected');
      await expect(
        call('core_mcpserver_set_approval', {
          name,
          approval: { tools: { list_records: 'Maybe' } },
        }),
      ).rejects.toThrow(/must be Allow, Ask or Block/);
      await expect(
        call('core_mcpserver_set_approval', { name }),
      ).rejects.toThrow(/presets: recommended, allow-all, ask-all/);
    });

    it("stores a create's preset as its rule alone, as muster does before any tool is listed", async () => {
      await call('core_mcpserver_create', {
        preset: 'recommended',
        name: 'cellar',
        type: 'streamable-http',
        url: 'https://cellar.example.com/mcp',
        autoStart: true,
      });

      expect(objectOf('cellar')?.getApproval()).toEqual({ rule: 'Ask' });
      jest.advanceTimersByTime(CONNECT_MS);
      const tools = await toolsOf('cellar');
      expect(tools.length).toBeGreaterThan(0);
      // Each tool follows the rule, New: nothing is written out per tool.
      expect(
        tools.every(
          t =>
            t.approval?.source === 'connector' &&
            t.approval.new === true &&
            t.approval.setting === 'ask',
        ),
      ).toBe(true);
    });

    it('hides the tools without their own entry when the rule is Block', async () => {
      const name = 'cellar-block';
      await call('core_mcpserver_create', {
        name,
        type: 'streamable-http',
        url: 'https://cellar.example.com/mcp',
        autoStart: true,
        preset: 'allow-all',
      });
      jest.advanceTimersByTime(CONNECT_MS);
      const [kept, ...rest] = await toolsOf(name);
      expect(rest.length).toBeGreaterThan(0);

      await call('core_mcpserver_set_approval', {
        name,
        approval: {
          rule: 'Block',
          tools: { [kept.name.replace(`x_${name}_`, '')]: 'Allow' },
        },
      });

      expect((await toolsOf(name)).map(t => t.name)).toEqual([kept.name]);
    });

    it('refuses a settings write whose expectedGeneration is stale, as muster does', async () => {
      const name = named('Connected');
      const generation = (await api.listServers(INSTALLATION)).mcpServers?.find(
        server => server.name === name,
      )?.generation;
      expect(typeof generation).toBe('number');

      await call('core_mcpserver_update', { name, description: 'Changed.' });
      await expect(
        call('core_mcpserver_set_approval', {
          name,
          approval: { rule: 'Ask' },
          expectedGeneration: generation,
        }),
      ).rejects.toThrow(/^conflict: MCP server '.*' changed since it was read/);
      await expect(
        call('core_mcpserver_set_approval', {
          name,
          approval: { rule: 'Ask' },
          expectedGeneration: generation! + 1,
        }),
      ).resolves.toBeDefined();
    });

    it('refuses a create without approval settings, as muster does', async () => {
      await expect(
        call('core_mcpserver_create', {
          name: 'bare',
          type: 'streamable-http',
          url: 'https://bare.example.com/mcp',
        }),
      ).rejects.toEqual(
        expect.objectContaining({
          message:
            "core_mcpserver_create needs the server's approval settings: pass preset (recommended, allow-all, ask-all) or approval {rule, tools}",
          status: 422,
        }),
      );
    });
  });

  it('registers a connector, which connects and then serves its tools', async () => {
    await expect(
      call('core_mcpserver_create', {
        preset: 'allow-all',
        name: 'orchard',
        displayName: 'Orchard',
        tags: ['team-a'],
        type: 'streamable-http',
        url: 'https://orchard.example.com/mcp',
        description: 'Reads the orchard.',
        autoStart: true,
      }),
    ).resolves.toBe("MCP server 'orchard' created successfully");

    expect(await stateOf('orchard')).toBe('Connecting');
    const object = objectOf('orchard')!;
    expect(object.getDisplayName()).toBe('Orchard');
    expect(object.getTags()).toEqual(['team-a']);
    expect(object.getUrl()).toBe('https://orchard.example.com/mcp');
    expect(object.getAutoStart()).toBe(true);
    await expect(api.listConnectorNames(INSTALLATION)).resolves.toEqual({
      servers: expect.arrayContaining([
        { name: 'orchard', displayName: 'Orchard' },
      ]),
    });

    jest.advanceTimersByTime(CONNECT_MS);
    expect(await stateOf('orchard')).toBe('Connected');
    expect(objectOf('orchard')?.getState()).toBe('Connected');
    const { tools, total } = await api.filterTools({
      installation: INSTALLATION,
      pattern: 'x_orchard_*',
    });
    expect(tools).toHaveLength(NEW_CONNECTOR_TOOLS);
    expect(total).toBe(NEW_CONNECTOR_TOOLS);
  });

  it('refuses a name taken, as muster does', async () => {
    await expect(
      call('core_mcpserver_create', {
        preset: 'allow-all',
        name: named('Connected'),
        type: 'streamable-http',
        url: 'https://taken.example.com/mcp',
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        message: `MCP server '${named('Connected')}' already exists`,
        status: 422,
        kind: 'connector_refused',
      }),
    );
  });

  it("refuses each split write the other's arguments before writing, as muster does", async () => {
    const name = named('Connected');
    const before = objectOf(name)?.getUrl();

    await expect(
      call('core_mcpserver_update', {
        name,
        url: 'https://elsewhere.example.com/mcp',
        description: 'Moved.',
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        message:
          'core_mcpserver_update does not take url: use core_mcpserver_connect or core_mcpserver_set_approval',
        status: 422,
      }),
    );
    await expect(
      call('core_mcpserver_connect', { name, description: 'Moved.' }),
    ).rejects.toEqual(
      expect.objectContaining({
        message:
          'core_mcpserver_connect does not take description: use core_mcpserver_update or core_mcpserver_set_approval',
      }),
    );
    expect(objectOf(name)?.getUrl()).toBe(before);

    await call('core_mcpserver_connect', {
      name,
      url: 'https://elsewhere.example.com/mcp',
    });
    expect(objectOf(name)?.getUrl()).toBe('https://elsewhere.example.com/mcp');
  });

  it('has a connector at a host no muster reaches fail once it tried', async () => {
    await call('core_mcpserver_create', {
      preset: 'allow-all',
      name: 'nowhere',
      type: 'streamable-http',
      url: 'https://nowhere.invalid/mcp',
      autoStart: true,
    });
    jest.advanceTimersByTime(CONNECT_MS);

    expect(await stateOf('nowhere')).toBe('Failed');
    const { servers } = await api.getAuthStatus(INSTALLATION);
    expect(servers.find(s => s.name === 'nowhere')?.status).toBe('failed');
  });

  it('has an OAuth connector wait for the person’s sign-in, and connect after it', async () => {
    await call('core_mcpserver_create', {
      preset: 'allow-all',
      name: 'grove',
      type: 'streamable-http',
      url: 'https://grove.example.com/mcp',
      auth: { type: 'oauth' },
      autoStart: true,
    });
    jest.advanceTimersByTime(CONNECT_MS);

    expect(await stateOf('grove')).toBe('Auth Required');
    await expect(
      call('core_service_restart', { name: 'grove' }),
    ).rejects.toEqual(
      expect.objectContaining({
        message: expect.stringContaining(
          "Service 'grove' requires OAuth authentication.",
        ),
      }),
    );

    await api.signInServer('grove', INSTALLATION);
    expect(await stateOf('grove')).toBe('Connecting');
    jest.advanceTimersByTime(CONNECT_MS);
    expect(await stateOf('grove')).toBe('Connected');

    await api.signOutServer('grove', INSTALLATION);
    expect(await stateOf('grove')).toBe('Auth Required');
  });

  it('edits a connector by muster’s merge rules, and connects it again', async () => {
    const name = named('Failed');
    const before = objectOf(name)!;

    await expect(
      call('core_mcpserver_connect', {
        name,
        type: 'streamable-http',
        url: 'https://moved.example.com/mcp',
      }),
    ).resolves.toBe(`MCP server '${name}' updated successfully`);
    await expect(
      call('core_mcpserver_update', {
        name,
        description: '',
        displayName: 'Moved',
      }),
    ).resolves.toBe(`MCP server '${name}' updated successfully`);

    const after = objectOf(name)!;
    expect(after.getUrl()).toBe('https://moved.example.com/mcp');
    expect(after.getDescription()).toBe(before.getDescription());
    expect(after.getDisplayName()).toBe('Moved');
    expect(after.jsonData.metadata.generation).toBe(3);
    expect(after.isReconcilePending()).toBe(true);
    expect(await stateOf(name)).toBe('Connecting');
    // The new URL answers: it no longer fails.
    jest.advanceTimersByTime(CONNECT_MS);
    expect(await stateOf(name)).toBe('Connected');
    expect(objectOf(name)?.isReconcilePending()).toBe(false);
  });

  it('keeps a failing connector failing when reconnected', async () => {
    const name = named('Failed');

    await expect(call('core_service_restart', { name })).resolves.toBe(
      `Restart of service '${name}' requested; the reconciler will restart it`,
    );
    expect(await stateOf(name)).toBe('Connecting');
    jest.advanceTimersByTime(CONNECT_MS);
    expect(await stateOf(name)).toBe('Failed');
  });

  it('deactivates and activates a connector', async () => {
    const name = named('Connected');

    await call('core_service_stop', { name });
    expect(await stateOf(name)).toBe('Stopped');
    expect(objectOf(name)?.getSuspended()).toBe(true);
    await expect(call('core_service_restart', { name })).rejects.toEqual(
      expect.objectContaining({
        message: `Service '${name}' is suspended; use core_service_start to resume it`,
      }),
    );
    await expect(call('core_service_stop', { name })).resolves.toBe(
      `Service '${name}' is already suspended`,
    );

    await call('core_service_start', { name });
    expect(objectOf(name)?.getSuspended()).toBeFalsy();
    expect(await stateOf(name)).toBe('Connecting');
    jest.advanceTimersByTime(CONNECT_MS);
    expect(await stateOf(name)).toBe('Connected');
    await expect(call('core_service_start', { name })).resolves.toBe(
      `Service '${name}' is already running`,
    );
  });

  it('serves the data set’s stopped connector as deactivated', () => {
    expect(objectOf(named('Stopped'))?.getSuspended()).toBe(true);
  });

  it('deletes a connector', async () => {
    const name = named('Connected');
    const objects = musterKubernetesObjectsOf(INSTALLATION);

    await expect(call('core_mcpserver_delete', { name })).resolves.toBe(
      `MCP server '${name}' deleted successfully`,
    );

    expect(musterKubernetesObjectsOf(INSTALLATION)).not.toBe(objects);
    expect(objectOf(name)).toBeUndefined();
    expect(await stateOf(name)).toBeUndefined();
    await expect(call('core_mcpserver_delete', { name })).rejects.toEqual(
      expect.objectContaining({
        message: `Failed to delete MCP server: MCP server '${name}' not found`,
      }),
    );
  });

  it("deletes an organization's connector by muster's key for it", async () => {
    const [own] = inInstallation(
      baseDataSet().organizationConnectors,
      INSTALLATION,
    );
    const owned = () =>
      musterKubernetesObjectsOf(INSTALLATION).filter(
        o => o.kind === 'MCPServer' && o.metadata.namespace === own.namespace,
      );
    expect(owned()).toHaveLength(1);

    await call('core_mcpserver_delete', {
      name: `${own.namespace}/${own.name}`,
    });

    expect(owned()).toHaveLength(0);
  });

  it('answers the same objects while nothing changed', () => {
    expect(musterKubernetesObjectsOf(INSTALLATION)).toBe(
      musterKubernetesObjectsOf(INSTALLATION),
    );
  });

  it('forgets the writes when the scenario is set again, as on a reload', async () => {
    await call('core_mcpserver_delete', { name: named('Connected') });

    setFixtureScenarioForTests(undefined);

    expect(objectOf(named('Connected'))).toBeDefined();
  });

  it('fails the writes in the error scenario, as muster does', async () => {
    setFixtureScenarioForTests('error');
    const failing = musterFixtureApi([]);

    await expect(
      failing.callTool(
        'core_service_stop',
        { name: named('Connected') },
        INSTALLATION,
      ),
    ).rejects.toEqual(expect.objectContaining({ status: 401 }));
  });

  const workflowObjectOf = (name: string) => {
    const object = musterKubernetesObjectsOf(INSTALLATION).find(
      o => o.kind === 'Workflow' && o.metadata.name === name,
    );
    return new MusterWorkflow(
      object as MusterWorkflow['jsonData'],
      INSTALLATION,
    );
  };

  it('settles a deactivated edit, so no reconcile stays pending', async () => {
    const name = named('Connected');
    await call('core_mcpserver_update', { name, description: 'Changed.' });
    expect(objectOf(name)?.isReconcilePending()).toBe(true);

    await call('core_service_stop', { name });

    expect(await stateOf(name)).toBe('Stopped');
    expect(objectOf(name)?.isReconcilePending()).toBe(false);
  });

  it('leaves a connector never started stopped when it is edited', async () => {
    await call('core_mcpserver_create', {
      preset: 'allow-all',
      name: 'idle',
      type: 'streamable-http',
      url: 'https://idle.example.com/mcp',
    });
    expect(await stateOf('idle')).toBe('Stopped');

    await call('core_mcpserver_update', { name: 'idle', description: 'New.' });
    jest.advanceTimersByTime(CONNECT_MS);

    expect(await stateOf('idle')).toBe('Stopped');
    expect(objectOf('idle')?.isReconcilePending()).toBe(false);
    expect(objectOf('idle')?.getDescription()).toBe('New.');
  });

  it('bumps the generation on every spec write, as the API server does', async () => {
    const name = named('Connected');
    const generation = () => objectOf(name)!.jsonData.metadata.generation;
    expect(generation()).toBe(1);

    await call('core_service_stop', { name });
    expect(generation()).toBe(2);
    expect(objectOf(name)?.isReconcilePending()).toBe(false);

    await call('core_service_start', { name });
    expect(generation()).toBe(3);
    expect(objectOf(name)?.jsonData.spec).toEqual(
      expect.objectContaining({ restartRequestedAt: expect.any(String) }),
    );
    expect(objectOf(name)?.isReconcilePending()).toBe(true);
    jest.advanceTimersByTime(CONNECT_MS);
    expect(objectOf(name)?.isReconcilePending()).toBe(false);

    await call('core_service_restart', { name });
    expect(generation()).toBe(4);
    // Nothing written: the generation stays.
    jest.advanceTimersByTime(CONNECT_MS);
    await call('core_service_start', { name });
    expect(generation()).toBe(4);
  });

  it('keeps the stored type when an edit leaves it out', async () => {
    const name = named('Connected');
    const type = objectOf(name)!.getType();

    await expect(
      call('core_mcpserver_update', { name, description: 'Only this.' }),
    ).resolves.toBe(`MCP server '${name}' updated successfully`);

    expect(objectOf(name)?.getType()).toBe(type);
    expect(objectOf(name)?.getDescription()).toBe('Only this.');
  });

  it('keeps a past run as it ran after its connector is removed', async () => {
    const { workflows } = await api.listWorkflows();
    const [name] = (workflows ?? [])
      .filter(workflow => workflow.available)
      .map(workflow => workflow.name);
    const [firstStep] = workflowObjectOf(name).getReferencedTools();
    const connector = connectors.find(c =>
      firstStep.startsWith(`x_${c.name}_`),
    )!;
    const list = () =>
      api.listExecutions({ installation: INSTALLATION, workflowName: name });
    const runs = async () =>
      Promise.all(
        ((await list()).executions ?? []).map(summary =>
          api.getExecution(summary.execution_id, INSTALLATION),
        ),
      );
    const listed = await list();
    const before = await runs();
    expect(
      before.some(run => run.steps?.some(step => step.tool === firstStep)),
    ).toBe(true);

    await call('core_mcpserver_delete', { name: connector.name });

    expect(workflowObjectOf(name).isValid()).toBe(false);
    await expect(list()).resolves.toEqual(listed);
    await expect(runs()).resolves.toEqual(before);
  });

  it('marks the workflows that call a deleted connector’s tools unavailable', async () => {
    const before = await api.filterTools({
      installation: INSTALLATION,
      pattern: 'workflow_*',
    });
    const [listed] = before.tools ?? [];
    const name = listed.name.replace(/^workflow_/, '');
    const [firstStep] = workflowObjectOf(name).getReferencedTools();
    const connector = connectors.find(c =>
      firstStep.startsWith(`x_${c.name}_`),
    )!;

    await call('core_mcpserver_delete', { name: connector.name });

    const workflow = workflowObjectOf(name);
    expect(workflow.isValid()).toBe(false);
    expect(workflow.getValidationErrors()).toContain(
      `Step 1 calls ${firstStep}, which no connector offers.`,
    );
    const after = await api.filterTools({
      installation: INSTALLATION,
      pattern: 'workflow_*',
    });
    expect(after.tools?.map(tool => tool.name)).not.toContain(listed.name);
    const usage = await api.getMcpUsage({
      installation: INSTALLATION,
      servers: [connector.name],
    });
    expect(usage.totals.calls).toBe(0);
  });

  it('fails the transport probe for a host no muster reaches, and the connector then fails', async () => {
    const url = 'https://nowhere.invalid/mcp';
    expect(
      parseTransportDetection(await call('core_mcpserver_detect', { url })),
    ).toEqual(
      expect.objectContaining({
        transport: 'unknown',
        reachable: false,
        detail: expect.stringMatching(
          /^no probe succeeded \(streamable-http: .*no such host; sse: .*no such host\)$/,
        ),
      }),
    );
    expect(
      parseTransportDetection(
        await call('core_mcpserver_detect', {
          url: 'https://grove.example.com/mcp',
        }),
      ),
    ).toEqual(expect.objectContaining({ reachable: true }));

    await call('core_mcpserver_create', {
      preset: 'allow-all',
      name: 'nowhere',
      type: 'streamable-http',
      url,
      autoStart: true,
    });
    jest.advanceTimersByTime(CONNECT_MS);
    expect(await stateOf('nowhere')).toBe('Failed');
  });

  it('asks for the sign-in of a kept connector that an edit gave OAuth', async () => {
    const name = named('Running');
    const url = objectOf(name)!.getUrl();

    await call('core_mcpserver_connect', {
      name,
      type: 'streamable-http',
      url,
      auth: { type: 'oauth' },
    });
    jest.advanceTimersByTime(CONNECT_MS);

    expect(await stateOf(name)).toBe('Auth Required');
  });

  it('names a connector’s tools after the tool prefix its definition sets', async () => {
    await call('core_mcpserver_create', {
      preset: 'allow-all',
      name: 'orchard',
      type: 'streamable-http',
      url: 'https://orchard.example.com/mcp',
      toolPrefix: 'orch',
      autoStart: true,
    });
    jest.advanceTimersByTime(CONNECT_MS);

    const prefix = objectOf('orchard')!.getToolNamePrefix();
    expect(prefix).toBe('x_orch');
    const { tools, total } = await api.filterTools({
      installation: INSTALLATION,
      pattern: `${prefix}_*`,
    });
    expect(total).toBe(NEW_CONNECTOR_TOOLS);
    expect(tools?.every(tool => tool.server === 'orchard')).toBe(true);
  });

  it('works out an installation again only after a write there', async () => {
    const fennel = musterKubernetesObjectsOf('fennel');
    const meadow = musterKubernetesObjectsOf(INSTALLATION);

    await call('core_service_stop', { name: named('Connected') });

    expect(musterKubernetesObjectsOf('fennel')).toBe(fennel);
    expect(musterKubernetesObjectsOf(INSTALLATION)).not.toBe(meadow);
  });

  it('answers a start and a restart in muster’s words, OAuth included', () => {
    const state = new MusterFixtureState(baseDataSet(), () => 0);
    const name = named('Connected');
    state.stop(INSTALLATION, { name });

    expect(state.start(INSTALLATION, { name })).toBe(
      `Start of service '${name}' requested; the reconciler will start it`,
    );
    expect(state.restart(INSTALLATION, { name })).toBe(
      `Restart of service '${name}' requested; the reconciler will restart it`,
    );
    state.connectWrite(INSTALLATION, { name, auth: { type: 'oauth' } });
    state.signIn(INSTALLATION, name);
    expect(state.restart(INSTALLATION, { name })).toBe(
      `Restart of service '${name}' requested; the reconciler will restart it. This server uses OAuth: if it comes up auth-required, authenticate with core_auth_login`,
    );
  });

  it('serves one scenario’s data set at a time, connectors, workflows and presets alike', async () => {
    const kept = musterFixtureApi([]);
    const read = (muster: typeof kept) =>
      Promise.all([
        muster.filterTools({
          installation: INSTALLATION,
          includePresets: true,
        }),
        muster.listWorkflows(),
        muster.listServers(INSTALLATION),
      ]);
    const before = await read(kept);

    setFixtureScenarioForTests('empty');

    const after = await read(kept);
    expect(after).toEqual(await read(musterFixtureApi([])));
    expect(after).not.toEqual(before);
    expect(after[1].workflows).toEqual([]);
  });
});
