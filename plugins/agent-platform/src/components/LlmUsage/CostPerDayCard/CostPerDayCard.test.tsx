import { render, screen } from '@testing-library/react';
import type { LlmDailySeries } from '../../../lib/llmUsage';
import { CostPerDayCard } from './CostPerDayCard';

jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  // recharts needs layout jsdom will not do; whether the chart draws its key
  // is the thing under test here, so record it instead of rendering a chart.
  StackedBarChart: ({
    series,
    showLegend,
  }: {
    series: { dataKey: string }[];
    showLegend?: boolean;
  }) => (
    <div
      data-testid="chart"
      data-series={series.map(s => s.dataKey).join(',')}
      data-legend={String(Boolean(showLegend))}
    />
  ),
}));

function daily(models: string[]): LlmDailySeries {
  return {
    rows: [
      {
        day: '2026-10-09',
        ...Object.fromEntries(models.map(model => [model, 1])),
      },
    ],
    series: models,
  };
}

describe('CostPerDayCard', () => {
  it('draws a key while several models share the stack', () => {
    render(<CostPerDayCard daily={daily(['claude-sonnet-4-5', 'gpt-4o'])} />);

    expect(screen.getByTestId('chart')).toHaveAttribute('data-legend', 'true');
  });

  it('draws no key for one model, as on a model page', () => {
    render(<CostPerDayCard daily={daily(['claude-sonnet-4-5'])} />);

    expect(screen.getByTestId('chart')).toHaveAttribute(
      'data-series',
      'claude-sonnet-4-5',
    );
    expect(screen.getByTestId('chart')).toHaveAttribute('data-legend', 'false');
  });
});
