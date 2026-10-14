import type { Meta, StoryObj } from '@storybook/react';
import { Flex } from '@backstage/ui';
import { StatusDot } from '../StatusDot';
import { StatusHint } from './StatusHint';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/StatusHint',
  component: StatusHint,
  tags: ['autodocs'],
  args: {
    subject: 'Sonnet 4.5',
    explanation: 'Secret kagent/sonnet-key not found.',
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'The explanation of a state in a list: an info icon beside a ' +
            "`StatusDot`'s few words, with the sentences that say why behind it.",
          whenToUse:
            'In a table or stacked row whose status has a reason worth ' +
            'reading (a model that is not accepted, a connector whose sign-in ' +
            'expired), where the sentences would push the state itself out ' +
            'of the cell. Renders nothing without an explanation.',
          migration: 'mixed',
          extra:
            'A tooltip on hover or focus; inside the agent shell a press (or ' +
            'tap) also opens it as a popover. Pressing it never reaches the ' +
            'row. Place it 4px after the dot and label, the pair not shrinking.',
        }),
      },
    },
  },
} satisfies Meta<typeof StatusHint>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

const pair = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--bui-space-1)',
  flex: 'none',
} as const;

export const BesideAStatus: Story = {
  render: () => (
    <Flex direction="column" gap="2">
      <span style={pair}>
        <StatusDot tone="success" label="Ready" />
        <StatusHint subject="Sonnet 4.5" />
      </span>
      <span style={pair}>
        <StatusDot tone="danger" label="Not accepted" />
        <StatusHint
          subject="Opus 4.7"
          explanation="Secret kagent/opus-key not found."
        />
      </span>
      <span style={pair}>
        <StatusDot tone="neutral" label="Pending" />
        <StatusHint
          subject="Qwen 3"
          explanation={[
            'The controller has not reconciled the latest change yet.',
            'Check back in a minute.',
          ]}
        />
      </span>
    </Flex>
  ),
};
