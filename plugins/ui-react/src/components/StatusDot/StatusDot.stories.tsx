import type { Meta, StoryObj } from '@storybook/react';
import { Flex } from '@backstage/ui';
import { StatusDot } from './StatusDot';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/StatusDot',
  component: StatusDot,
  tags: ['autodocs'],
  args: { tone: 'info', label: 'Working' },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A small coloured dot for a state, optionally followed by its ' +
            'label. Colours follow the session-state tones.',
          whenToUse:
            'Where a state sits in a dense list: a session row, the rail, an ' +
            'agent row. Without a visible label, pass `aria-label` so the state ' +
            'is still announced. For a status that needs an icon shape as well ' +
            'as a colour, use `StatusLabel`.',
          migration: 'mixed',
          extra:
            'The colour reads `--agent-platform-state-dot-<tone>` before the ' +
            'theme palette, so an app stylesheet can recolour every dot at once.',
        }),
      },
    },
  },
} satisfies Meta<typeof StatusDot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllTones: Story = {
  render: () => (
    <Flex direction="column" gap="2">
      <StatusDot tone="warning" label="Waiting for you" />
      <StatusDot tone="info" label="Working" />
      <StatusDot tone="success" label="Finished" />
      <StatusDot tone="danger" label="Failed" />
      <StatusDot tone="neutral" label="Finished" />
    </Flex>
  ),
};

export const WithoutLabel: Story = {
  args: { label: undefined, 'aria-label': 'Working' },
};
