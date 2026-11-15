import {
  baseDataSet,
  CONNECTOR_STATES,
  inInstallation,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import { FixtureToolMissingError, MusterFixtureApi } from './MusterFixtureApi';

describe('MusterFixtureApi', () => {
  const getInfo = jest.fn(() => ({ version: '1' }));
  const api = new MusterFixtureApi([
    { server: 'agent-manager', tools: { get_info: getInfo } },
  ]);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('serves the installations of the data set, the person signed in', async () => {
    const { installations } = await api.listInstallations();

    expect(installations).toEqual([
      expect.objectContaining({ name: 'meadow', reachable: true }),
      expect.objectContaining({ name: 'fennel', reachable: true }),
      expect.objectContaining({ name: 'tarragon', reachable: false }),
    ]);
    for (const name of ['meadow', 'fennel']) {
      await expect(
        api.filterTools({ installation: name, limit: 1 }),
      ).resolves.toEqual(expect.objectContaining({ tools: expect.any(Array) }));
    }
    await expect(api.signIn()).resolves.toBe(true);
  });

  it('refuses the unreachable installation’s reads, as muster-backend does', async () => {
    const refusal = expect.objectContaining({
      name: 'ServiceUnavailableError',
      status: 503,
      message:
        'tarragon did not answer: not reachable from this portal (timeout)',
    });
    await expect(api.filterTools({ installation: 'tarragon' })).rejects.toEqual(
      refusal,
    );
    await expect(api.listServers('tarragon')).rejects.toEqual(refusal);
    await expect(
      api.listExecutions({ installation: 'tarragon' }),
    ).rejects.toEqual(refusal);
    await expect(api.getMcpUsage({ installation: 'tarragon' })).rejects.toEqual(
      refusal,
    );
    await expect(
      api.callTool('x_agent-manager_get_info', {}, 'tarragon'),
    ).rejects.toEqual(refusal);
    await expect(api.getAuthStatus('tarragon')).resolves.toEqual(
      expect.objectContaining({ servers: [], unavailable: true }),
    );
    await expect(api.listConnectorNames('tarragon')).resolves.toEqual({
      servers: [],
      unavailable: true,
    });
    await expect(api.getServerInfo('tarragon')).resolves.toEqual({
      unavailable: true,
    });
  });

  it('dispatches a tool call to its server’s handler', async () => {
    await expect(
      api.callTool('x_agent-manager_get_info', { a: 1 }, 'meadow'),
    ).resolves.toEqual({ version: '1' });
    expect(getInfo).toHaveBeenCalledWith(
      { a: 1 },
      { installation: 'meadow', signal: undefined },
    );
  });

  it('fails a tool no server handles, loudly', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await expect(
      api.callTool('x_agent-manager_list_agents', {}, 'meadow'),
    ).rejects.toBeInstanceOf(FixtureToolMissingError);
    await expect(
      api.callToolWithProgress('x_unknown_tool', {}, { onProgress: jest.fn() }),
    ).rejects.toThrow(
      'Fixture mode has no handler for the tool x_unknown_tool',
    );
    expect(consoleError).toHaveBeenCalledTimes(2);
  });

  it('lists the contributed servers as connected, with their tools', async () => {
    const { mcpServers } = await api.listServers();
    expect(mcpServers).toContainEqual(
      expect.objectContaining({
        name: 'agent-manager',
        state: 'Connected',
        toolsCount: 1,
      }),
    );
    const { servers } = await api.getAuthStatus();
    expect(servers).toContainEqual({
      name: 'agent-manager',
      status: 'connected',
    });
    await expect(
      api.filterTools({ pattern: 'x_agent-manager_*' }),
    ).resolves.toEqual(
      expect.objectContaining({
        tools: [
          expect.objectContaining({
            name: 'x_agent-manager_get_info',
            server: 'agent-manager',
          }),
        ],
      }),
    );
    await expect(api.filterTools({ pattern: 'x_other_*' })).resolves.toEqual(
      expect.objectContaining({ tools: [], filtered_count: 0 }),
    );
  });

  describe('serving the base data set', () => {
    const data = baseDataSet();
    const connectors = inInstallation(data.connectors, 'fennel');
    const serving = connectors.filter(c =>
      ['Connected', 'Running'].includes(c.state),
    );

    it('lists every connector of the installation, in its state', async () => {
      const { mcpServers } = await api.listServers('fennel');
      expect(mcpServers?.map(s => [s.name, s.state])).toEqual(
        expect.arrayContaining(connectors.map(c => [c.name, c.state])),
      );
      expect(new Set(mcpServers?.map(s => s.state))).toEqual(
        new Set([...CONNECTOR_STATES, 'Connected']),
      );
      await expect(api.listConnectorNames('fennel')).resolves.toEqual({
        servers: connectors.map(c => ({
          name: c.name,
          displayName: c.displayName,
        })),
      });
    });

    it('reports the person’s sign-in to each connector', async () => {
      const { servers } = await api.getAuthStatus('fennel');
      const statusOf = (state: string) =>
        servers.find(
          s => s.name === connectors.find(c => c.state === state)!.name,
        )?.status;
      expect(statusOf('Connected')).toBe('connected');
      expect(statusOf('Auth Required')).toBe('auth_required');
      expect(statusOf('Failed')).toBe('failed');
      const { servers_requiring_auth } = await api.listTools('fennel');
      expect(servers_requiring_auth).toEqual([
        expect.objectContaining({ auth_tool: 'core_auth_login' }),
      ]);
    });

    it('catalogues the serving connectors’ tools and the workflows', async () => {
      const { tools, total } = await api.filterTools({
        installation: 'fennel',
      });
      const servers = new Set(tools?.map(t => t.server));
      for (const connector of connectors) {
        expect(servers.has(connector.name)).toBe(serving.includes(connector));
      }
      expect(tools?.filter(t => t.server === serving[0].name)).toHaveLength(
        serving[0].toolsCount,
      );
      const available = inInstallation(data.workflows, 'fennel').filter(
        w => w.state === 'available',
      );
      expect(
        tools
          ?.filter(t => t.kind === 'workflow')
          .map(t => [t.name, t.annotations?.readOnlyHint]),
      ).toEqual(available.map(w => [`workflow_${w.name}`, true]));
      expect(total).toBe(tools?.length);
      expect(tools?.[0].inputSchema).toBeUndefined();
    });

    it("describes a contributed server's tool with the schema it declares", async () => {
      const schema = {
        type: 'object',
        properties: { accelerator: { type: 'string', enum: ['nvidia-l4'] } },
      };
      const withSchema = new MusterFixtureApi([
        {
          server: 'cluster-manager',
          tools: { create_node_pool: () => ({}), get_info: () => ({}) },
          inputSchemas: { create_node_pool: schema },
        },
      ]);
      await expect(
        withSchema.describeTool('x_cluster-manager_create_node_pool', 'meadow'),
      ).resolves.toEqual(expect.objectContaining({ inputSchema: schema }));
      await expect(
        withSchema.describeTool('x_cluster-manager_get_info', 'meadow'),
      ).resolves.toEqual(expect.objectContaining({ inputSchema: undefined }));
    });

    it('describes a tool with its schema, and pages and searches', async () => {
      const [first] = (await api.filterTools({ installation: 'fennel' }))
        .tools!;
      await expect(api.describeTool(first.name, 'fennel')).resolves.toEqual(
        expect.objectContaining({
          name: first.name,
          server: first.server,
          inputSchema: expect.objectContaining({ type: 'object' }),
        }),
      );
      await expect(
        api.describeTool('core_auth_login', 'fennel'),
      ).resolves.toEqual(expect.objectContaining({ kind: 'core' }));
      const paged = await api.filterTools({
        installation: 'fennel',
        limit: 2,
        offset: 1,
        includeSchema: true,
      });
      expect(paged.tools).toHaveLength(2);
      expect(paged.truncated).toBe(true);
      expect(paged.tools?.[0].inputSchema).toBeDefined();
      const found = await api.filterTools({
        installation: 'fennel',
        query: 'delete',
      });
      expect(found.tools?.length).toBeGreaterThan(0);
      expect(found.tools?.every(t => t.name.includes('delete'))).toBe(true);
      expect((await api.listCoreTools('fennel')).tools).toContainEqual(
        expect.objectContaining({ name: 'core_mcpserver_list' }),
      );
    });

    it('lists the serving connectors’ resources and prompts', async () => {
      const resources = await api.filterResources({ installation: 'fennel' });
      expect(new Set(resources.resources?.map(r => r.server))).toEqual(
        new Set(serving.map(c => c.name)),
      );
      const one = await api.filterResources({
        installation: 'fennel',
        server: serving[0].name,
      });
      expect(one.resources).toHaveLength(2);
      expect(one.total).toBe(2);
      const prompts = await api.filterPrompts({
        installation: 'fennel',
        server: serving[0].name,
      });
      expect(prompts.prompts).toEqual([
        expect.objectContaining({ server: serving[0].name }),
      ]);
    });

    it('lists workflows and their executions, newest first', async () => {
      const [workflow] = inInstallation(data.workflows, 'meadow');
      await expect(api.listWorkflows()).resolves.toEqual({
        workflows: expect.arrayContaining([
          expect.objectContaining({ name: workflow.name }),
        ]),
      });
      const all = await api.listExecutions({ installation: 'meadow' });
      expect(all.total).toBe(inInstallation(data.executions, 'meadow').length);
      const starts = all.executions!.map(e => e.started_at);
      expect(starts).toEqual([...starts].sort().reverse());
      const failed = await api.listExecutions({
        installation: 'meadow',
        workflowName: workflow.name,
        status: 'failed',
        limit: 1,
      });
      expect(failed.executions).toEqual([
        expect.objectContaining({
          workflow_name: workflow.name,
          status: 'failed',
        }),
      ]);
    });

    it('reads an execution with its steps, and a workflow’s stats', async () => {
      const failed = inInstallation(data.executions, 'meadow').find(
        e => e.state === 'failed',
      )!;
      const execution = await api.getExecution(failed.id, 'meadow');
      const steps = execution.steps!;
      expect(steps.length).toBeLessThanOrEqual(failed.stepCount);
      expect(execution.error).toMatch(
        new RegExp(`^Step ${steps.length} failed: `),
      );
      expect(steps.at(-1)).toEqual(
        expect.objectContaining({ status: 'failed', error: execution.error }),
      );
      const { executions } = await api.listExecutions({
        installation: 'meadow',
        workflowName: failed.workflow,
        status: 'failed',
      });
      expect(executions).toEqual([
        expect.objectContaining({
          step_count: steps.length,
          error: execution.error,
        }),
      ]);
      await expect(api.getExecution('missing', 'meadow')).rejects.toThrow(
        'No execution missing',
      );
      const stats = await api.getWorkflowStats(failed.workflow, 'meadow');
      expect(stats).toEqual(
        expect.objectContaining({ runs: 3, completed: 1, failed: 1 }),
      );
      expect(stats.success_rate).toBe(0.5);
    });

    it('reports usage and latency, narrowed to a server or a tool', async () => {
      const usage = await api.getMcpUsage({
        installation: 'fennel',
        hours: 24,
      });
      expect(usage.available).toBe(true);
      expect(usage.buckets).toHaveLength(24);
      expect(usage.totals.calls).toBeGreaterThan(0);
      expect(usage.top_tools.length).toBeLessThanOrEqual(15);
      const bucketed = (u: typeof usage) =>
        u.buckets.reduce((sum, b) => sum + b.ok + b.error + b.error_result, 0);
      expect(bucketed(usage)).toBe(usage.totals.calls);
      expect(
        usage.buckets.reduce((sum, b) => sum + b.error + b.error_result, 0),
      ).toBe(usage.totals.errors);

      const odd = await api.getMcpUsage({ installation: 'fennel', hours: 100 });
      expect(odd.buckets).toHaveLength(17);
      expect(Date.parse(odd.buckets[0].start)).toBe(
        Date.parse(odd.buckets[16].start) - 16 * 6 * 3600 * 1000,
      );
      expect(bucketed(odd)).toBe(odd.totals.calls);

      const server = connectors[0].name;
      const narrowed = await api.getMcpUsage({
        installation: 'fennel',
        hours: 168,
        servers: [server],
      });
      expect(narrowed.servers).toEqual([
        expect.objectContaining({
          server,
          p95_seconds: expect.any(Number),
        }),
      ]);
      expect(narrowed.top_tools).toHaveLength(connectors[0].toolsCount);
      expect(narrowed.step_hours).toBe(6);

      const tool = narrowed.top_tools[0].tool;
      const one = await api.getMcpUsage({ installation: 'fennel', tool });
      expect(one.top_tools).toEqual([
        expect.objectContaining({ tool, p95_seconds: expect.any(Number) }),
      ]);
      const latency = await api.getMcpToolLatency({
        installation: 'fennel',
        servers: [server],
      });
      expect(latency.tools).toHaveLength(connectors[0].toolsCount);
    });

    it('reports the resources and prompts a serving connector offers', async () => {
      const { mcpServers } = await api.listServers('fennel');
      const runtime = mcpServers!.find(s => s.name === serving[0].name);
      expect(runtime).toEqual(
        expect.objectContaining({ resourcesCount: 2, promptsCount: 1 }),
      );
    });

    it('lists the presets, and resolves a toolset within the catalogue', async () => {
      const presets = (
        await api.filterTools({
          installation: 'fennel',
          includePresets: true,
          limit: 1,
        })
      ).presets!;
      expect(presets.map(p => p.name)).toEqual([
        'read-only',
        'none',
        'full',
        'daily-checks',
        'reviews',
        'legacy-reports',
      ]);

      const daily = inInstallation(data.toolsetPresets, 'fennel')[0];
      const resolved = await api.filterTools({
        installation: 'fennel',
        toolset: ['preset:daily-checks', 'server:retired-reports'],
      });
      expect(resolved.toolset).toEqual([
        'preset:daily-checks',
        'server:retired-reports',
      ]);
      expect(resolved.toolset_unmatched).toEqual(['server:retired-reports']);
      expect(resolved.presets).toHaveLength(6);
      const [server, workflow] = daily.selectors.map(s => s.split(':')[1]);
      expect(new Set(resolved.tools!.map(t => t.server ?? t.name))).toEqual(
        new Set([server, `workflow_${workflow}`]),
      );

      const readOnly = await api.filterTools({
        installation: 'fennel',
        toolset: ['preset:read-only'],
      });
      expect(readOnly.tools!.length).toBeGreaterThan(0);
      expect(
        readOnly.tools!.every(t => t.annotations?.readOnlyHint === true),
      ).toBe(true);
      await expect(
        api.filterTools({ installation: 'fennel', toolset: ['preset:none'] }),
      ).resolves.toEqual(
        expect.objectContaining({ tools: [], toolset_unmatched: [] }),
      );
      await expect(
        api.filterTools({ installation: 'fennel', toolset: ['preset:gone'] }),
      ).rejects.toThrow('unknown preset "gone"');
    });
  });

  it('fails a call for an installation it does not serve, loudly', async () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await expect(
      api.callTool('x_agent-manager_get_info', {}, 'elsewhere'),
    ).rejects.toThrow('Fixture mode serves no installation elsewhere');
    await expect(api.listServers('elsewhere')).rejects.toThrow(
      'Fixture mode serves no installation elsewhere',
    );
    expect(getInfo).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ installation: 'elsewhere' }),
    );
    expect(consoleError).toHaveBeenCalledTimes(2);
  });
});
