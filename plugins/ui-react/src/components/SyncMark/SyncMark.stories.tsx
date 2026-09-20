import type { Meta, StoryObj } from '@storybook/react';
import { Flex, Text } from '@backstage/ui';
import { SYNC_MARKS, SyncMarkIcon } from './SyncMark';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/SyncMarkIcon',
  component: SyncMarkIcon,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'One icon for how something a manager keeps to a definition ' +
            'stands — in sync, not in sync, not reconciled, not installed, ' +
            'failed, unknown — with the words in the tooltip and the ' +
            'accessible name.',
          whenToUse:
            'A fleet table where a column of states should scan as a row ' +
            "of lights: the Installations page's capability columns, the " +
            "Repositories page's Set-up column. Fold the manager's states " +
            'into the six marks, keep its words as the label, and put the ' +
            'legend (`syncMarkLegend`) in the column header. Where the words ' +
            'should stay visible, use `StatusLabel`.',
          migration: 'none',
        }),
      },
    },
  },
} satisfies Meta<typeof SyncMarkIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    mark: 'in sync',
    state: 'enabled',
    label: 'enabled · installed, as defined',
  },
};

export const AllMarks: Story = {
  args: { mark: 'in sync', label: 'in sync' },
  render: () => (
    <Flex direction="column" gap="2">
      {SYNC_MARKS.map(mark => (
        <Flex key={mark} align="center" gap="2">
          <SyncMarkIcon mark={mark} label={mark} />
          <Text variant="body-medium">{mark}</Text>
        </Flex>
      ))}
    </Flex>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Every mark has its own silhouette as well as its own colour, so ' +
          'the state survives greyscale and colour blindness.',
      },
    },
  },
};
