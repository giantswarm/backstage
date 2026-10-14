import type { Meta, StoryObj } from '@storybook/react';
import { Stat } from '../Stat';
import { StatDelta } from './StatDelta';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/StatDelta',
  component: StatDelta,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'Muted text on a `Stat` value’s baseline: a change against the previous window.',
          whenToUse:
            'As a `Stat`’s `beside`, for a comparison that adds context to the figure. Keep it short; it wraps at phone width.',
          migration: 'mui-v4',
        }),
      },
    },
  },
} satisfies Meta<typeof StatDelta>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: '+12% vs last week' },
};

export const BesideATile: Story = {
  args: { children: '+12% vs last week' },
  render: args => (
    <div style={{ maxWidth: 280 }}>
      <Stat
        variant="tile"
        label="Spend"
        value="$1,234.56"
        beside={<StatDelta {...args} />}
      />
    </div>
  ),
};
