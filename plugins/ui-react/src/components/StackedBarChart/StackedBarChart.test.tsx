import { render, screen, within } from '@testing-library/react';
import { StackedBarChart } from './StackedBarChart';

const DATA = [
  { day: '2026-10-10', a: 1, b: 2 },
  { day: '2026-10-11', a: 3, b: 4 },
];

const SERIES = [
  { dataKey: 'a', name: 'claude-sonnet-4-5-20250929', color: '#256abf' },
  { dataKey: 'b', name: 'qwen3-14b-instruct-awq', color: '#e6a817' },
];

// T22 C20: recharts' own legend was given a fixed 28px, and eight model
// names wrapping at phone width ran over the card's note below the chart.
describe('StackedBarChart legend', () => {
  it('lists the series under the chart, in stack order, as a list that wraps in the flow', () => {
    render(
      <StackedBarChart data={DATA} xAxisKey="day" series={SERIES} showLegend />,
    );

    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map(item => item.textContent),
    ).toEqual(['claude-sonnet-4-5-20250929', 'qwen3-14b-instruct-awq']);
    expect(legend).toHaveStyle({ display: 'flex', flexWrap: 'wrap' });
    // No height of its own: it takes the lines its names need.
    expect(legend.style.height).toBe('');
  });

  it('draws no legend unless asked', () => {
    render(<StackedBarChart data={DATA} xAxisKey="day" series={SERIES} />);

    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull();
  });
});
