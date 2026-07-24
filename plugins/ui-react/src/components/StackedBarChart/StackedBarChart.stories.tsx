import type { Meta, StoryObj } from '@storybook/react';
import { StackedBarChart } from './StackedBarChart';
import type { StackedBarChartProps } from './StackedBarChart';
import { componentDocs } from '../../storybook/docs';

type Row = {
  day: string;
  ready: number;
  creating: number;
  deleting: number;
};

const data: Row[] = [
  { day: '2026-01-10', ready: 12, creating: 2, deleting: 1 },
  { day: '2026-01-11', ready: 14, creating: 1, deleting: 0 },
  { day: '2026-01-12', ready: 13, creating: 3, deleting: 2 },
  { day: '2026-01-13', ready: 16, creating: 0, deleting: 1 },
  { day: '2026-01-14', ready: 18, creating: 2, deleting: 0 },
];

const meta = {
  title: 'Components/StackedBarChart',
  component: StackedBarChart,
  tags: ['autodocs'],
  // recharts' ResponsiveContainer fills its parent — give it a sized box.
  decorators: [
    Story => (
      <div style={{ width: 560, maxWidth: '100%' }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A theme-aware stacked bar chart built on recharts. Axis text, grid, ' +
            'and a custom tooltip all read from the active MUI theme, so it looks ' +
            'native in light and dark mode. Callers pass plain data rows plus a ' +
            '`series` config describing each stacked segment.',
          whenToUse:
            'For a compact categorical time/count breakdown (e.g. cluster status ' +
            'over time). recharts stays an implementation detail — you don’t import ' +
            'it directly.',
          migration: 'mui-v4',
          extra: 'Charting is `recharts`; theming reads from the MUI v4 theme.',
        }),
      },
    },
  },
  // Type the meta by the concrete args (`StackedBarChartProps<Row>`) rather than
  // `typeof StackedBarChart`: the component is generic, and `typeof` collapses
  // `T` to `object`, making `xAxisKey` (`keyof T & string`) resolve to `never`.
} satisfies Meta<StackedBarChartProps<Row>>;

export default meta;
type Story = StoryObj<StackedBarChartProps<Row>>;

export const Default: Story = {
  args: {
    data,
    xAxisKey: 'day',
    series: [
      { dataKey: 'ready', name: 'Ready', color: '#4caf50' },
      { dataKey: 'creating', name: 'Creating', color: '#ff9800' },
      { dataKey: 'deleting', name: 'Deleting', color: '#f44336' },
    ],
    formatXAxisTick: (value: string) => value.slice(5),
  },
};

export const TallerSingleSeries: Story = {
  args: {
    data,
    xAxisKey: 'day',
    height: 220,
    series: [{ dataKey: 'ready', name: 'Ready clusters', color: '#4caf50' }],
    formatXAxisTick: (value: string) => value.slice(5),
  },
  parameters: {
    docs: {
      description: {
        story: 'A single series and a taller `height`.',
      },
    },
  },
};
