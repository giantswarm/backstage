import type { MusterMcpClient } from '@giantswarm/backstage-plugin-gs-node';
import { getMcpToolLatency, getMcpUsage, isPartialUsage } from './mcpUsage';

const installation = {
  name: 'graveler',
  url: 'https://muster.example/mcp',
  prometheusServer: 'graveler-mcp-prometheus',
};

type Call = { tool: string; arguments: Record<string, unknown> };

function fixture(optimized: boolean, histogramValue?: string) {
  const calls: Call[] = [];
  const client = {
    callTool: async (tool: string, arguments_: Record<string, unknown>) => {
      calls.push({ tool, arguments: arguments_ });
      const query = String(arguments_.query);
      const combined = query.includes('sum by (mcpserver_name, tool, outcome)');
      if (!optimized && combined) throw new Error('query failed');
      const end = Date.parse(String(arguments_.end)) / 1000;
      const start = Date.parse(String(arguments_.start)) / 1000;
      const dimensions = query.match(/sum by \(([^)]+)\)/)![1].split(', ');
      const rows = [
        { mcpserver_name: 'a', tool: 'read', outcome: 'ok', count: 10 },
        { mcpserver_name: 'b', tool: 'write', outcome: 'error', count: 2 },
      ].filter(row => {
        const server = query.match(/mcpserver_name="([^"]+)"/)?.[1];
        const toolName = query.match(/tool="([^"]+)"/)?.[1];
        return (
          (!server || row.mcpserver_name === server) &&
          (!toolName || row.tool === toolName)
        );
      });
      const groups = new Map<string, number>();
      for (const row of rows) {
        const histogram = query.includes('_bucket');
        for (const [le, value] of histogram
          ? ([
              ['1', 50],
              ['5', 100],
              ['+Inf', 100],
            ] as const)
          : ([['', row.count]] as const)) {
          const labels = { ...row, le } as Record<string, unknown>;
          const names = dimensions;
          const key = names.map(name => `${name}="${labels[name]}"`).join(', ');
          groups.set(key, (groups.get(key) ?? 0) + value);
        }
      }
      const step = arguments_.step === '1h' ? 3600 : 86400;
      const timestamp = Math.ceil(Date.now() / (step * 1000)) * step;
      const points = [timestamp - step, timestamp];
      return `Result Type: matrix\nResult: ${[...groups]
        .map(
          ([labels, value]) =>
            `{${labels}} =>\n${points
              .filter(time => time >= start && time <= end)
              .map(
                time =>
                  `${query.includes('_bucket') && histogramValue !== undefined ? histogramValue : value} @[${time}]`,
              )
              .join('\n')}`,
        )
        .join('\n')}`;
    },
  } as unknown as MusterMcpClient;
  return { client, calls };
}

describe('optimized usage queries', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-12T12:30:00Z') });
  });
  afterEach(() => jest.useRealTimers());

  it.each([168, 720, 2160, 24, 49])(
    'preserves the complete response for %s hours',
    async hours => {
      const original = fixture(false);
      const optimized = fixture(true);
      const expected = await getMcpUsage(
        original.client,
        installation,
        {},
        hours,
      );
      const actual = await getMcpUsage(
        optimized.client,
        installation,
        {},
        hours,
      );
      expect(actual).toEqual(expected);
      expect(actual.totals.calls).toBe(24);
      expect(isPartialUsage(actual)).toBe(false);
      expect(
        optimized.calls.some(call => call.tool.endsWith('execute_query')),
      ).toBe(false);
    },
  );

  it.each([['a'], ['a', 'b']])(
    'preserves filtered usage for %s',
    async (...servers) => {
      const expected = await getMcpUsage(
        fixture(false).client,
        installation,
        {},
        720,
        servers,
      );
      const actual = await getMcpUsage(
        fixture(true).client,
        installation,
        {},
        720,
        servers,
      );
      expect(actual).toEqual(expected);
    },
  );

  it('preserves a single tool view', async () => {
    const expected = await getMcpUsage(
      fixture(false).client,
      installation,
      {},
      720,
      ['a'],
      'read',
    );
    const actual = await getMcpUsage(
      fixture(true).client,
      installation,
      {},
      720,
      ['a'],
      'read',
    );
    expect(actual).toEqual(expected);
  });

  it('uses three cacheable range reads for the unfiltered page', async () => {
    const { client, calls } = fixture(true);
    await getMcpUsage(client, installation, { authToken: 'fixture' }, 720);
    const latency = await getMcpToolLatency(client, installation, {}, 720);
    expect(calls).toHaveLength(3);
    expect(calls.every(call => call.arguments.unlimited === 'true')).toBe(true);
    expect(latency.tools).toEqual([
      { tool: 'read', p95_seconds: 4.6 },
      { tool: 'write', p95_seconds: 4.6 },
    ]);
    expect(calls.every(call => call.tool.endsWith('execute_range_query'))).toBe(
      true,
    );
    expect(
      calls.every(call => call.arguments.end === '2026-11-13T00:00:00.000Z'),
    ).toBe(true);
    expect(calls[0].arguments.query).toContain('[24h]');
  });

  it.each(['NaN', '+Inf', '-Inf'])('normalizes %s quantiles', async value => {
    const { client } = fixture(true, value);
    const usage = await getMcpUsage(client, installation, {}, 720);
    expect(usage.totals.p95_seconds).toBeNull();
  });
});
