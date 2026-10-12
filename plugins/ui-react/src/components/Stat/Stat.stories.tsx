import type { Meta, StoryObj } from '@storybook/react';
import { Stat, StatDelta, StatGrid } from './Stat';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/Stat',
  component: Stat,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'One labelled number: an uppercase muted label over a large tabular-nums value.',
          whenToUse:
            'The primitive a stats strip is built from — a figure a reader scans rather than acts on. Give a `tone` only to a value that is good or bad; a plain count takes none. Give a `hint` when the arithmetic behind the number is not obvious from its label. Use `variant="tile"` in a `StatGrid` for a page\'s headline figures, each in its own card.',
          migration: 'mui-v4',
        }),
      },
    },
  },
} satisfies Meta<typeof Stat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { label: 'Input tokens', value: '8.4M' },
};

export const WithTone: Story = {
  args: { label: 'Healthy', value: '12', tone: 'ok' },
  render: () => (
    <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
      <Stat label="Healthy" value="12" tone="ok" />
      <Stat label="Degraded" value="3" tone="warning" />
      <Stat label="Failed" value="1" tone="error" />
      <Stat label="Workflows" value="7" tone="info" />
      <Stat label="Unknown" value="—" tone="neutral" />
    </div>
  ),
};

export const LongLabel: Story = {
  args: { label: 'Input tokens (billed, cumulative)', value: '1.4M' },
};

export const InAStrip: Story = {
  args: { label: 'Sessions', value: '14' },
  render: () => (
    <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
      <Stat label="Sessions" value="14" />
      <Stat label="Turns" value="62" />
      <Stat label="Input tokens (billed)" value="8.4M" />
      <Stat label="Output tokens" value="104k" />
      <Stat label="Tool calls" value="231" />
    </div>
  ),
};

export const WithHint: Story = {
  args: {
    label: 'Tokens per second',
    value: '63/s',
    hint: "The median streamed call's generation speed over the last 30 days. Calls answered in one piece are not measured, and idle time is not counted.",
  },
};

export const TilesInAGrid: Story = {
  args: { label: 'Spend', value: '$1,234.56', variant: 'tile' },
  render: () => (
    <StatGrid>
      <Stat
        variant="tile"
        label="Spend"
        value="$1,234.56"
        beside={<StatDelta>+12% vs last week</StatDelta>}
        sub="Last 7 days"
      />
      <Stat variant="tile" label="Model calls" value="12,345" />
      <Stat
        variant="tile"
        label="Tokens"
        value="7.5M"
        hint="Input and output tokens, billed."
      />
      <Stat variant="tile" label="Error ratio" value="2.1%" tone="warning" />
    </StatGrid>
  ),
};
