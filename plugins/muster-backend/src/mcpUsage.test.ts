import {
  getMcpUsage,
  pickPrometheusServer,
  quantileFromBuckets,
} from './mcpUsage';
import {
  MusterInstallationConfig,
  MusterMcpClient,
} from '@giantswarm/backstage-plugin-gs-node';

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

describe('quantileFromBuckets', () => {
  it('interpolates within the bucket containing the rank', () => {
    const buckets = new Map<number, number>([
      [1, 60],
      [5, 95],
      [Infinity, 100],
    ]);
    expect(quantileFromBuckets(0.95, buckets)).toBe(5);
    expect(quantileFromBuckets(0.5, buckets)).toBeCloseTo(50 / 60);
  });

  it('caps at the highest finite bound when the quantile is in +Inf', () => {
    const buckets = new Map<number, number>([
      [1, 10],
      [Infinity, 100],
    ]);
    expect(quantileFromBuckets(0.95, buckets)).toBe(1);
  });

  it('returns null for empty or zero-count histograms', () => {
    expect(quantileFromBuckets(0.95, new Map())).toBeNull();
    expect(
      quantileFromBuckets(
        0.95,
        new Map([
          [1, 0],
          [Infinity, 0],
        ]),
      ),
    ).toBeNull();
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

  it('aggregates buckets, tools and servers from step-split range queries', async () => {
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const client = fakeClient((tool, args) => {
      calls.push({ tool, args });
      if (tool === 'core_mcpserver_list') {
        return SERVER_LIST;
      }
      // start/end are RFC3339 strings; samples come back in Unix seconds.
      const end = Date.parse(String(args.end)) / 1000;
      const query = String(args.query);
      if (query.includes('sum by (outcome)')) {
        return [
          'Result Type: matrix',
          'Result: {outcome="ok"} =>',
          `10 @[${end - 3600}]`,
          `20 @[${end}]`,
          '{outcome="error"} =>',
          `1 @[${end}]`,
        ].join('\n');
      }
      if (query.includes('sum by (tool, outcome)')) {
        return [
          'Result Type: matrix',
          'Result: {outcome="ok", tool="x_kubernetes_list_pods"} =>',
          `10 @[${end - 3600}]`,
          `15 @[${end}]`,
          '{outcome="error", tool="x_kubernetes_list_pods"} =>',
          `1 @[${end}]`,
          '{outcome="ok", tool="x_prometheus_execute_query"} =>',
          `5 @[${end}]`,
        ].join('\n');
      }
      if (query.includes('sum by (mcpserver_name, outcome)')) {
        return [
          'Result Type: matrix',
          'Result: {mcpserver_name="gazelle-mcp-kubernetes", outcome="ok"} =>',
          `10 @[${end - 3600}]`,
          `15 @[${end}]`,
          '{mcpserver_name="gazelle-mcp-kubernetes", outcome="error"} =>',
          `1 @[${end}]`,
          '{mcpserver_name="gazelle-mcp-prometheus", outcome="ok"} =>',
          `5 @[${end}]`,
        ].join('\n');
      }
      if (query.includes('sum by (le)')) {
        return [
          'Result Type: matrix',
          `Result: {le="1"} =>`,
          `30 @[${end - 3600}]`,
          `30 @[${end}]`,
          '{le="5"} =>',
          `45 @[${end - 3600}]`,
          `50 @[${end}]`,
          '{le="+Inf"} =>',
          `50 @[${end - 3600}]`,
          `50 @[${end}]`,
        ].join('\n');
      }
      if (query.includes('sum by (tool, le)')) {
        return [
          'Result Type: matrix',
          'Result: {le="1", tool="x_kubernetes_list_pods"} =>',
          `50 @[${end}]`,
          '{le="5", tool="x_kubernetes_list_pods"} =>',
          `100 @[${end}]`,
          '{le="+Inf", tool="x_kubernetes_list_pods"} =>',
          `100 @[${end}]`,
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
      // Client-side histogram_quantile over the summed buckets:
      // le1=60, le5=95, +Inf=100 → rank 95 lands exactly on le=5.
      p95_seconds: 5,
      distinct_tools: 2,
    });

    expect(usage.top_tools).toEqual([
      {
        tool: 'x_kubernetes_list_pods',
        calls: 26,
        errors: 1,
        // le1=50, le5=100 → rank 95 → 1 + 4 * (45/50).
        p95_seconds: 4.6,
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

  describe('a month-to-date window in daily steps', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    // A daily sample for every evaluation the range query asks for, and one
    // at the window's start, the last day of the month before.
    function dailyClient(seen: Array<Record<string, unknown>>) {
      return fakeClient((tool, args) => {
        if (tool === 'core_mcpserver_list') {
          return SERVER_LIST;
        }
        seen.push(args);
        const start = Date.parse(String(args.start)) / 1000;
        const end = Date.parse(String(args.end)) / 1000;
        const lines = [
          'Result Type: matrix',
          'Result: {outcome="ok", mcpserver_name="jira"} =>',
        ];
        lines.push(`100 @[${start - 86400}]`);
        for (let ts = start; ts <= end; ts += 86400) {
          lines.push(`1 @[${ts}]`);
        }
        return lines.join('\n');
      });
    }

    it.each([
      ['on the 1st', '2026-10-01T10:30:00Z', 1],
      ['on the 2nd', '2026-10-02T23:59:00Z', 2],
      ['on the 3rd', '2026-10-03T00:30:00Z', 3],
      ['on the 31st', '2026-10-31T12:00:00Z', 31],
    ])(
      'covers the days of the month and none before %s',
      async (_, now, day) => {
        jest.useFakeTimers({ now: new Date(now) });
        const seen: Array<Record<string, unknown>> = [];

        const usage = await getMcpUsage(
          dailyClient(seen),
          INSTALLATION,
          {},
          24 * day,
          { stepHours: 24 },
        );

        expect(seen[0].start).toBe(`2026-10-02T00:00:00.000Z`);
        expect(seen[0].end).toBe(
          new Date(Date.UTC(2026, 9, day + 1)).toISOString(),
        );
        expect(usage.step_hours).toBe(24);
        expect(usage.buckets.map(bucket => bucket.start)).toEqual(
          Array.from({ length: day }, (__, index) =>
            new Date(Date.UTC(2026, 9, index + 1)).toISOString(),
          ),
        );
        expect(usage.totals.calls).toBe(day);
        expect(usage.servers).toEqual([
          { server: 'jira', calls: day, errors: 0 },
        ]);
      },
    );

    it('leaves out a sample from before the window that the server sends anyway', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-01T10:30:00Z') });
      const client = fakeClient((tool, args) => {
        if (tool === 'core_mcpserver_list') {
          return SERVER_LIST;
        }
        const end = Date.parse(String(args.end)) / 1000;
        return [
          'Result Type: matrix',
          'Result: {outcome="ok", mcpserver_name="jira"} =>',
          `100 @[${end - 86400}]`,
          `3 @[${end}]`,
        ].join('\n');
      });

      const usage = await getMcpUsage(client, INSTALLATION, {}, 24, {
        stepHours: 24,
      });

      expect(usage.totals.calls).toBe(3);
      expect(usage.servers).toEqual([{ server: 'jira', calls: 3, errors: 0 }]);
    });
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

  it('degrades to empty rollups when only the secondary queries fail', async () => {
    const client = fakeClient((tool, args) => {
      if (tool === 'core_mcpserver_list') {
        return SERVER_LIST;
      }
      const query = String(args.query);
      if (query.includes('sum by (outcome)')) {
        const end = Date.parse(String(args.end)) / 1000;
        return [
          'Result Type: matrix',
          'Result: {outcome="ok"} =>',
          `7 @[${end}]`,
        ].join('\n');
      }
      throw new Error('server_error: server error: 500');
    });

    const usage = await getMcpUsage(client, INSTALLATION, {}, 24);
    expect(usage.available).toBe(true);
    expect(usage.totals).toEqual({
      calls: 7,
      errors: 0,
      error_ratio: 0,
      p95_seconds: null,
      distinct_tools: 0,
    });
    expect(usage.top_tools).toEqual([]);
    expect(usage.servers).toEqual([]);
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
