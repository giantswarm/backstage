import type { McpUsage } from '../../../apis';
import { withToolLatency } from './useToolLatency';

const usage = {
  available: true,
  top_tools: [
    { tool: 'a', calls: 3, errors: 0, p95_seconds: null },
    { tool: 'b', calls: 1, errors: 0, p95_seconds: 0.7 },
  ],
} as McpUsage;

describe('withToolLatency', () => {
  it('fills each tool row from the latency read, keeping rows it does not name', () => {
    expect(
      withToolLatency(usage, {
        available: true,
        range_hours: 24,
        tools: [{ tool: 'a', p95_seconds: 1.2 }],
      }).top_tools,
    ).toEqual([
      { tool: 'a', calls: 3, errors: 0, p95_seconds: 1.2 },
      { tool: 'b', calls: 1, errors: 0, p95_seconds: 0.7 },
    ]);
  });

  it.each([
    ['not read yet', undefined],
    ['unavailable', { available: false, range_hours: 24, tools: [] }],
  ])('leaves the usage as it is when the latency is %s', (_label, latency) => {
    expect(withToolLatency(usage, latency)).toBe(usage);
  });
});
