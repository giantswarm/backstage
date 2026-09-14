import { render } from '@testing-library/react';
import type { LlmDailySeries } from '../../../lib/llmUsage';
import { TokensByTypeCard } from './TokensByTypeCard';

jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  // recharts needs layout jsdom will not do; the series config is the thing
  // under test here, so record it instead of rendering a chart.
  StackedBarChart: ({
    series,
    data,
  }: {
    series: { dataKey: string; name: string }[];
    data: Record<string, unknown>[];
  }) => (
    <div
      data-testid="chart"
      data-series={series.map(s => `${s.dataKey}:${s.name}`).join(',')}
      data-rows={JSON.stringify(data)}
    />
  ),
}));

function chart(container: HTMLElement) {
  const node = container.querySelector('[data-testid="chart"]')!;
  return {
    series: (node.getAttribute('data-series') ?? '').split(',').filter(Boolean),
    rows: JSON.parse(node.getAttribute('data-rows') ?? '[]'),
  };
}

const KNOWN: LlmDailySeries = {
  rows: [
    { day: '2026-09-10', input: 900, output: 100, input_cache_read: 50 },
    { day: '2026-09-11', input: 800, output: 200, input_cache_read: 0 },
  ],
  series: ['input', 'output', 'input_cache_read'],
};

describe('TokensByTypeCard', () => {
  it('renders the known types in a fixed order, cheapest first', () => {
    const { container } = render(<TokensByTypeCard daily={KNOWN} />);

    expect(chart(container).series).toEqual([
      'input_cache_read:cache read',
      'input:input',
      'output:output',
    ]);
  });

  it('pools a token type it does not know rather than dropping it', () => {
    // Dropped, its tokens vanished from this chart while still counting in the
    // totals strip above — two panels disagreeing with nothing explaining why.
    const daily: LlmDailySeries = {
      rows: [{ day: '2026-09-10', input: 900, reasoning: 40, unknown: 10 }],
      series: ['input', 'reasoning', 'unknown'],
    };

    const { series, rows } = chart(
      render(<TokensByTypeCard daily={daily} />).container,
    );

    expect(series).toEqual(['input:input', '__other__:other']);
    // 40 + 10, so the day's total still adds up.
    expect(rows[0].__other__).toBe(50);
    expect(rows[0].input).toBe(900);
  });

  it('adds no pooled band when every type is known', () => {
    const { series } = chart(
      render(<TokensByTypeCard daily={KNOWN} />).container,
    );

    expect(series.some(s => s.startsWith('__other__'))).toBe(false);
  });

  it('omits a known type absent from the data', () => {
    const daily: LlmDailySeries = {
      rows: [{ day: '2026-09-10', input: 900 }],
      series: ['input'],
    };

    expect(
      chart(render(<TokensByTypeCard daily={daily} />).container).series,
    ).toEqual(['input:input']);
  });
});
