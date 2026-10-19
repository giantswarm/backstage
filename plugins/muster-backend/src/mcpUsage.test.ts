import {
  getMcpUsage,
  usageWindow,
  pickPrometheusServer,
  quantileFromBuckets,
  serverSelector,
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

describe('serverSelector', () => {
  it('is empty without servers', () => {
    expect(serverSelector()).toBe('');
    expect(serverSelector([])).toBe('');
  });

  it('matches one server exactly', () => {
    expect(serverSelector(['kagi'])).toBe('{mcpserver_name="kagi"}');
  });

  it('matches several as one alternation, each name literally', () => {
    expect(
      serverSelector(['graveler.mcp', 'gazelle-mcp', 'graveler.mcp']),
    ).toBe('{mcpserver_name=~"gazelle-mcp|graveler\\\\.mcp"}');
  });

  it('escapes what would end the string or the expression', () => {
    expect(serverSelector(['a"b'])).toBe('{mcpserver_name="a\\"b"}');
    expect(serverSelector(['a|b', 'c'])).toBe('{mcpserver_name=~"a\\\\|b|c"}');
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

  it('reports unavailable, naming the tool, where prometheus answers structured data instead of text', async () => {
    const client = fakeClient(tool =>
      tool === 'core_mcpserver_list' ? SERVER_LIST : { data: { result: [] } },
    );
    const usage = await getMcpUsage(client, INSTALLATION, {}, 24);
    expect(usage.available).toBe(false);
    expect(usage.reason).toMatch(
      /answered structured data, not the text the usage query parses/,
    );
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
    // The first sampled step's bucket, by its start.
    expect(usage.data_start).toBe(nonEmpty[0].start);

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
      {
        server: 'gazelle-mcp-kubernetes',
        calls: 26,
        errors: 1,
        p95_seconds: null,
      },
      {
        server: 'gazelle-mcp-prometheus',
        calls: 5,
        errors: 0,
        p95_seconds: null,
      },
    ]);
  });

  describe('narrowed to some connectors', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    /** Twenty tools, each called `index + 1` times on the window's last day. */
    const TOOLS = Array.from(
      { length: 20 },
      (_, index) => `x_kubernetes_tool_${String(index).padStart(2, '0')}`,
    );

    function narrowedClient(seen: Array<Record<string, unknown>>) {
      return fakeClient((tool, args) => {
        if (tool === 'core_mcpserver_list') {
          return SERVER_LIST;
        }
        seen.push(args);
        const end = Date.parse(String(args.end)) / 1000;
        const query = String(args.query);
        if (query.startsWith('sum by (outcome)') && !query.includes('{')) {
          // The installation's records: a first sample three days before
          // the window ends, nothing in the week before the window.
          return [
            'Result Type: matrix',
            'Result: {outcome="ok"} =>',
            `500 @[${end - 2 * 86400}]`,
            `700 @[${end}]`,
          ].join('\n');
        }
        if (query.startsWith('sum by (outcome)')) {
          return [
            'Result Type: matrix',
            'Result: {outcome="ok"} =>',
            `4 @[${end}]`,
            '{outcome="error_result"} =>',
            `1 @[${end}]`,
          ].join('\n');
        }
        if (query.startsWith('sum by (tool, outcome)')) {
          return [
            'Result Type: matrix',
            'Result:',
            ...TOOLS.flatMap((name, index) => [
              `{outcome="ok", tool="${name}"} =>`,
              `${index + 1} @[${end}]`,
            ]),
          ].join('\n');
        }
        if (query.startsWith('sum by (mcpserver_name, outcome)')) {
          return [
            'Result Type: matrix',
            'Result: {mcpserver_name="gazelle-mcp-kubernetes", outcome="ok"} =>',
            `3 @[${end}]`,
            '{mcpserver_name="graveler-mcp-kubernetes", outcome="ok"} =>',
            `2 @[${end}]`,
          ].join('\n');
        }
        if (query.startsWith('sum by (mcpserver_name, le)')) {
          return [
            'Result Type: matrix',
            'Result: {le="1", mcpserver_name="gazelle-mcp-kubernetes"} =>',
            `50 @[${end}]`,
            '{le="5", mcpserver_name="gazelle-mcp-kubernetes"} =>',
            `100 @[${end}]`,
            '{le="+Inf", mcpserver_name="gazelle-mcp-kubernetes"} =>',
            `100 @[${end}]`,
          ].join('\n');
        }
        return 'Result Type: matrix\nResult:';
      });
    }

    it('narrows every figure to the connectors, but not where the records start', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-14T10:30:00Z') });
      const seen: Array<Record<string, unknown>> = [];

      const usage = await getMcpUsage(
        narrowedClient(seen),
        INSTALLATION,
        {},
        24 * 30,
        ['graveler-mcp-kubernetes', 'gazelle-mcp-kubernetes'],
      );

      const selector =
        '{mcpserver_name=~"gazelle-mcp-kubernetes|graveler-mcp-kubernetes"}';
      const queries = seen.map(args => String(args.query));
      // The installation's records, read from a week before the window.
      const coverage = seen.find(
        args =>
          String(args.query) ===
          'sum by (outcome) (increase(muster_downstream_tool_calls_total[24h]))',
      );
      // Its first evaluation is a step after the week before the window starts.
      expect(coverage?.start).toBe('2026-09-09T00:00:00.000Z');
      // Every other query, narrowed and over the window alone.
      const narrowed = seen.filter(args => args !== coverage);
      expect(narrowed).toHaveLength(6);
      for (const args of narrowed) {
        expect(String(args.query)).toContain(selector);
        expect(args.start).toBe('2026-09-16T00:00:00.000Z');
      }
      expect(queries).toContain(
        `sum by (mcpserver_name, le) (increase(muster_downstream_tool_call_duration_seconds_bucket${selector}[24h]))`,
      );

      expect(usage.totals).toMatchObject({ calls: 5, errors: 1 });
      // The records start on the 12th, whatever the connectors' own first
      // call was.
      expect(usage.data_start).toBe('2026-10-12T00:00:00.000Z');
    });

    it('lists every tool the connectors were called with, busiest first', async () => {
      const usage = await getMcpUsage(
        narrowedClient([]),
        INSTALLATION,
        {},
        24 * 30,
        ['gazelle-mcp-kubernetes'],
      );

      expect(usage.top_tools).toHaveLength(20);
      expect(usage.top_tools[0]).toMatchObject({
        tool: 'x_kubernetes_tool_19',
        calls: 20,
      });
      expect(usage.totals.distinct_tools).toBe(20);
    });

    it('reads one connector without the per-server queries, its row the totals', async () => {
      const seen: Array<Record<string, unknown>> = [];
      const usage = await getMcpUsage(
        narrowedClient(seen),
        INSTALLATION,
        {},
        24 * 30,
        ['gazelle-mcp-kubernetes'],
      );

      expect(
        seen.filter(args => String(args.query).includes('mcpserver_name,')),
      ).toEqual([]);
      expect(usage.servers).toEqual([
        {
          server: 'gazelle-mcp-kubernetes',
          calls: usage.totals.calls,
          errors: usage.totals.errors,
          p95_seconds: usage.totals.p95_seconds,
        },
      ]);
    });

    it('reads no per-server latency without a filter, which nothing shows', async () => {
      const seen: Array<Record<string, unknown>> = [];
      const usage = await getMcpUsage(
        narrowedClient(seen),
        INSTALLATION,
        {},
        24 * 30,
      );

      const queries = seen.map(args => String(args.query));
      expect(
        queries.some(query => query.startsWith('sum by (mcpserver_name, le)')),
      ).toBe(false);
      expect(
        queries.some(query =>
          query.startsWith('sum by (mcpserver_name, outcome)'),
        ),
      ).toBe(true);
      expect(usage.servers.every(row => row.p95_seconds === null)).toBe(true);
    });

    it('keeps the busiest fifteen tools without a filter', async () => {
      const usage = await getMcpUsage(
        narrowedClient([]),
        INSTALLATION,
        {},
        24 * 30,
      );

      expect(usage.top_tools).toHaveLength(15);
      expect(usage.totals.distinct_tools).toBe(20);
    });

    it('gives each connector its p95 latency', async () => {
      const usage = await getMcpUsage(
        narrowedClient([]),
        INSTALLATION,
        {},
        24 * 30,
        ['gazelle-mcp-kubernetes', 'graveler-mcp-kubernetes'],
      );

      expect(usage.servers).toEqual([
        {
          server: 'gazelle-mcp-kubernetes',
          calls: 3,
          errors: 0,
          // le1=50, le5=100 → rank 95 → 1 + 4 * (45/50).
          p95_seconds: 4.6,
        },
        {
          server: 'graveler-mcp-kubernetes',
          calls: 2,
          errors: 0,
          p95_seconds: null,
        },
      ]);
    });
  });

  describe('where the data starts', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    function clientWithDays(days: number) {
      return fakeClient((tool, args) => {
        if (tool === 'core_mcpserver_list') {
          return SERVER_LIST;
        }
        const end = Date.parse(String(args.end)) / 1000;
        const lines = ['Result Type: matrix', 'Result: {outcome="ok"} =>'];
        for (let day = days - 1; day >= 0; day--) {
          lines.push(`${day === days - 1 ? 0 : 2} @[${end - day * 86400}]`);
        }
        return days > 0 ? lines.join('\n') : 'Result Type: matrix\nResult:';
      });
    }

    it('is the first daily bucket with a sample, a zero included', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-14T10:30:00Z') });

      const usage = await getMcpUsage(clientWithDays(3), INSTALLATION, {}, 168);

      expect(usage.buckets).toHaveLength(7);
      expect(usage.data_start).toBe('2026-10-12T00:00:00.000Z');
    });

    it('is absent when muster recorded calls in the week before the window', async () => {
      // The window's first days were quiet, not unrecorded.
      jest.useFakeTimers({ now: new Date('2026-10-14T10:30:00Z') });
      const client = fakeClient((tool, args) => {
        if (tool === 'core_mcpserver_list') {
          return SERVER_LIST;
        }
        const end = Date.parse(String(args.end)) / 1000;
        return [
          'Result Type: matrix',
          'Result: {outcome="ok"} =>',
          `4 @[${end - 9 * 86400}]`,
          `2 @[${end}]`,
        ].join('\n');
      });

      const usage = await getMcpUsage(client, INSTALLATION, {}, 168);

      expect(usage.totals.calls).toBe(2);
      expect(usage).not.toHaveProperty('data_start');
    });

    it('counts only the outcomes the chart draws, as the chart does', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-14T10:30:00Z') });
      const client = fakeClient((tool, args) => {
        if (tool === 'core_mcpserver_list') {
          return SERVER_LIST;
        }
        const end = Date.parse(String(args.end)) / 1000;
        return [
          'Result Type: matrix',
          'Result: {outcome="unknown"} =>',
          `4 @[${end - 5 * 86400}]`,
          '{outcome="ok"} =>',
          `2 @[${end}]`,
        ].join('\n');
      });

      const usage = await getMcpUsage(client, INSTALLATION, {}, 168);

      expect(usage.data_start).toBe('2026-10-14T00:00:00.000Z');
    });

    it('is absent when no bucket has a sample', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-14T10:30:00Z') });

      const usage = await getMcpUsage(clientWithDays(0), INSTALLATION, {}, 168);

      expect(usage.available).toBe(true);
      expect(usage).not.toHaveProperty('data_start');
    });
  });

  describe('usageWindow', () => {
    const at = (iso: string) => Date.parse(iso) / 1000;
    const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

    it('ends a daily window after today, also at exactly midnight', () => {
      const window = usageWindow(72, at('2026-10-09T00:00:00Z'));

      expect(iso(window.endSeconds)).toBe('2026-10-10T00:00:00.000Z');
      expect(iso(window.startSeconds)).toBe('2026-10-07T00:00:00.000Z');
      expect(window.stepSeconds).toBe(86400);
    });

    it('ends an hourly window at the next whole hour', () => {
      const window = usageWindow(24, at('2026-10-09T10:30:00Z'));

      expect(iso(window.endSeconds)).toBe('2026-10-09T11:00:00.000Z');
      expect(iso(window.startSeconds)).toBe('2026-10-08T11:00:00.000Z');
      expect(window.stepSeconds).toBe(3600);
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
