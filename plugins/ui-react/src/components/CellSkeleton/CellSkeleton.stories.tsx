import type { Meta, StoryObj } from '@storybook/react';
import { Box } from '@backstage/ui';
import { FactList } from '../FactList';
import { CellSkeleton } from './CellSkeleton';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/CellSkeleton',
  component: CellSkeleton,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'The placeholder for one value that has not been read yet: one ' +
            'line of its text high, so the row keeps its height when the ' +
            'value arrives.',
          whenToUse:
            'A table cell or a `FactList` value that is read after the rest ' +
            "of the row, such as a connector's calls on its Details tab or " +
            'the rows of the Update skills dialog.',
          migration: 'bui',
        }),
      },
    },
  },
  decorators: [
    Story => (
      <Box style={{ maxWidth: 720 }}>
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof CellSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InATableCell: Story = {
  name: 'In a table cell',
  args: { width: '70%', variant: 'body-small' },
};

export const InAFactList: Story = {
  name: 'In a fact list',
  args: { width: 140, variant: 'body-medium', label: 'Reading calls…' },
  render: args => (
    <FactList
      size="medium"
      facts={[
        { label: 'Health', value: '1 of 1 instance healthy' },
        { label: 'Calls, last 30 days', value: <CellSkeleton {...args} /> },
        { label: 'Added', value: '3 months ago' },
      ]}
      labelWidth={160}
    />
  ),
};
