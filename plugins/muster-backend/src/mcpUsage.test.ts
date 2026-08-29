import { getMcpUsage, pickPrometheusServer } from './mcpUsage';
import { MusterInstallationConfig, MusterMcpClient } from './MusterMcpClient';

const INSTALLATION: MusterInstallationConfig = {
  name: 'gazelle',
  url: 'https://muster.example/mcp',
};

function fakeClient(
  handler: (tool: string, args: Record<string, unknown>) => unknown,
): MusterMcpClient {
  return {
    callTool: async (tool: string, args: Record<string, unknown>) =>
      handler(tool, args),
  } as unknown as MusterMcpClient;
}

const SERVER_LIST = {
  mcpServers: [
    { name: 'gazelle-mcp-kubernetes', state: 'Connected' },
    { name: 'gazelle-mcp-prometheus', state: 'Connected' },
    { name: 'graveler-mcp-prometheus', state: 'Connected' },
  ],
};

describe('pickPrometheusServer', () => {
  it('prefers the explicit config override', () => {
    expect(
      pickPrometheusServer(SERVER_LIST.mcpServers, {
        ...INSTALLATION,
        prometheusServer: 'custom-prom',
      }),
    ).toBe('custom-prom');
  });

  it('prefers the <installation>-mcp-prometheus convention', () => {
    expect(pickPrometheusServer(SERVER_LIST.mcpServers, INSTALLATION)).toBe(
      'gazelle-mcp-prometheus',
    );
  });

  it('falls back to the only prometheus-ish server', () => {
    expect(
      pickPrometheusServer(
        [{ name: 'kubernetes' }, { name: 'my-prometheus' }],
        INSTALLATION,
      ),
    ).toBe('my-prometheus');
  });

  it('returns undefined when nothing matches', () => {
    expect(
      pickPrometheusServer([{ name: 'kubernetes' }], INSTALLATION),
    ).toBeUndefined();
  });
});

describe('getMcpUsage', () => {
  it('reports unavailable when no prometheus server is registered', async () => {
    const client = fakeClient(tool => {
      if (tool === 'core_mcpserver_list') {
        return { mcpServers: [{ name: 'kubernetes' }] };
      }
      throw new Error(`unexpected tool ${tool}`);
    });

    const usage = await getMcpUsage(client, INSTALLATION, {}, 24);
    expect(usage.available).toBe(false);
    expect(usage.reason).toMatch(/no prometheus mcp server/i);
    expect(usage.totals.calls).toBe(0);
  });

  it('aggregates buckets, tools and servers from the family tools', async () => {
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const client = fakeClient((tool, args) => {
      calls.push({ tool, args });
      if (tool === 'core_mcpserver_list') {
        return SERVER_LIST;
      }
      if (tool === 'x_prometheus_execute_range_query') {
        // start/end are RFC3339 strings; samples come back in Unix seconds.
        const end = Date.parse(String(args.end)) / 1000;
        return [
          'Result Type: matrix',
          'Result: {outcome="ok"} =>',
          `10 @[${end - 3600}]`,
          `20 @[${end}]`,
          '{outcome="error"} =>',
          `1 @[${end}]`,
        ].join('\n');
      }
      const query = String(args.query);
      if (query.includes('sum by (tool, outcome)')) {
        return [
          'Result Type: vector',
          'Result: {outcome="ok", tool="x_kubernetes_list_pods"} => 25 @[1]',
          '{outcome="error", tool="x_kubernetes_list_pods"} => 1 @[1]',
          '{outcome="ok", tool="x_prometheus_execute_query"} => 5 @[1]',
        ].join('\n');
      }
      if (query.includes('sum by (mcpserver_name, outcome)')) {
        return [
          'Result Type: vector',
          'Result: {mcpserver_name="gazelle-mcp-kubernetes", outcome="ok"} => 25 @[1]',
          '{mcpserver_name="gazelle-mcp-kubernetes", outcome="error"} => 1 @[1]',
          '{mcpserver_name="gazelle-mcp-prometheus", outcome="ok"} => 5 @[1]',
        ].join('\n');
      }
      if (query.includes('sum by (le)')) {
        return 'Result Type: vector\nResult: {} => 4.75 @[1]';
      }
      if (query.includes('sum by (tool, le)')) {
        return [
          'Result Type: vector',
          'Result: {tool="x_kubernetes_list_pods"} => 2.5 @[1]',
        ].join('\n');
      }
      throw new Error(`unexpected query ${query}`);
    });

    const usage = await getMcpUsage(client, INSTALLATION, {}, 24);

    // Every prometheus query is routed to the installation's own server via
    // the family routing parameter.
    const promCalls = calls.filter(call =>
      call.tool.startsWith('x_prometheus_'),
    );
    expect(promCalls.length).toBeGreaterThan(0);
    expect(
      promCalls.every(
        call => call.args.management_cluster === 'gazelle-mcp-prometheus',
      ),
    ).toBe(true);

    // The range query sends RFC3339 timestamps — deployed mcp-prometheus
    // versions do not parse Unix seconds despite documenting them.
    const rangeCall = calls.find(
      call => call.tool === 'x_prometheus_execute_range_query',
    );
    expect(String(rangeCall?.args.start)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(String(rangeCall?.args.end)).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    expect(usage.available).toBe(true);
    expect(usage.source).toEqual({
      server: 'gazelle-mcp-prometheus',
      tool: 'x_prometheus_execute_query',
    });
    expect(usage.range_hours).toBe(24);
    expect(usage.step_hours).toBe(1);
    expect(usage.buckets).toHaveLength(24);
    const nonEmpty = usage.buckets.filter(
      bucket => bucket.ok + bucket.error + bucket.error_result > 0,
    );
    expect(nonEmpty).toHaveLength(2);
    expect(nonEmpty[1]).toMatchObject({ ok: 20, error: 1 });

    expect(usage.totals).toEqual({
      calls: 31,
      errors: 1,
      error_ratio: 1 / 31,
      p95_seconds: 4.75,
      distinct_tools: 2,
    });

    expect(usage.top_tools).toEqual([
      {
        tool: 'x_kubernetes_list_pods',
        calls: 26,
        errors: 1,
        p95_seconds: 2.5,
      },
      {
        tool: 'x_prometheus_execute_query',
        calls: 5,
        errors: 0,
        p95_seconds: null,
      },
    ]);

    expect(usage.servers).toEqual([
      { server: 'gazelle-mcp-kubernetes', calls: 26, errors: 1 },
      { server: 'gazelle-mcp-prometheus', calls: 5, errors: 0 },
    ]);
  });

  it('falls back to the x_<server>_ tool names when the family tool is missing', async () => {
    const fallbackCalls: Array<{
      tool: string;
      args: Record<string, unknown>;
    }> = [];
    const client = fakeClient((tool, args) => {
      if (tool === 'core_mcpserver_list') {
        return { mcpServers: [{ name: 'my-prometheus' }] };
      }
      if (tool.startsWith('x_prometheus_')) {
        throw new Error('tool not found: x_prometheus_execute_query');
      }
      fallbackCalls.push({ tool, args });
      return 'Result Type: vector\nResult: {} => 0 @[1]';
    });

    const usage = await getMcpUsage(client, INSTALLATION, {}, 24);
    expect(usage.available).toBe(true);
    expect(usage.totals.calls).toBe(0);
    expect(fallbackCalls.length).toBeGreaterThan(0);
    expect(
      fallbackCalls.every(
        call =>
          /^x_my-prometheus_execute_/.test(call.tool) &&
          call.args.management_cluster === undefined,
      ),
    ).toBe(true);
  });

  it('reports unavailable with the failure reason when queries error', async () => {
    const client = fakeClient(tool => {
      if (tool === 'core_mcpserver_list') {
        return SERVER_LIST;
      }
      throw new Error('upstream exploded');
    });

    const usage = await getMcpUsage(client, INSTALLATION, {}, 24);
    expect(usage.available).toBe(false);
    expect(usage.reason).toMatch(/upstream exploded/);
  });
});
