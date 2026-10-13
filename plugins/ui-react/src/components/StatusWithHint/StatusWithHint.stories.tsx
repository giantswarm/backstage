import type { Meta, StoryObj } from '@storybook/react';
import { Flex } from '@backstage/ui';
import { StatusWithHint } from './StatusWithHint';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/StatusWithHint',
  component: StatusWithHint,
  tags: ['autodocs'],
  args: {
    tone: 'danger',
    label: 'Not accepted',
    hint: 'Secret kagent/sonnet-key not found.',
    hintLabel: 'About the state of Sonnet 4.5',
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A state as a list row shows it: a `StatusDot` with a few words, ' +
            'and the explanation in an `InfoHint` beside them.',
          whenToUse:
            'In a table or stacked row whose status has a reason worth ' +
            'reading (a model that is not accepted, a connector whose sign-in ' +
            'expired), where the sentences would push the state itself out ' +
            'of the cell. Without a `hint`, it is the bare dot and label.',
          migration: 'mixed',
          extra:
            'The hint is a tooltip on hover or focus; inside the agent shell ' +
            'a press (or tap) also opens it as a popover. Pressing it never ' +
            'reaches the row.',
        }),
      },
    },
  },
} satisfies Meta<typeof StatusWithHint>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const InAList: Story = {
  render: () => (
    <Flex direction="column" gap="2">
      <StatusWithHint
        tone="success"
        label="Ready"
        hintLabel="About the state of Sonnet 4.5"
      />
      <StatusWithHint
        tone="danger"
        label="Not accepted"
        hint="Secret kagent/sonnet-key not found."
        hintLabel="About the state of Opus 4.7"
      />
      <StatusWithHint
        tone="neutral"
        label="Pending"
        hint="The controller has not reconciled the latest change yet."
        hintLabel="About the state of Qwen 3"
      />
    </Flex>
  ),
};

export const WithoutHint: Story = {
  args: { tone: 'success', label: 'Ready', hint: undefined },
};
