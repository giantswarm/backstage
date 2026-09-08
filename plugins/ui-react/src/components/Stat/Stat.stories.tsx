import type { Meta, StoryObj } from '@storybook/react';
import { Stat } from './Stat';
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
            'The primitive a stats strip is built from — a figure a reader scans rather than acts on. Give a `tone` only to a value that is good or bad; a plain count takes none.',
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
