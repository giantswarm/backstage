import type { Meta, StoryObj } from '@storybook/react';
import { Flex, Text } from '@backstage/ui';
import { InfoHint } from './InfoHint';
import { StatusLabel } from '../StatusLabel';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/InfoHint',
  component: InfoHint,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'An info icon that explains the thing next to it in a tooltip. ' +
            'A focusable button, so the explanation is reachable by keyboard, ' +
            'not only by hovering.',
          whenToUse:
            'When a label or a status needs a sentence of explanation the ' +
            'reader cannot infer — how a figure is calculated, why a status ' +
            'is not healthy. Prefer it over a `title` on inert text, which ' +
            'keyboard and touch users never see. Not for restating the label.',
          migration: 'mixed',
        }),
      },
    },
  },
} satisfies Meta<typeof InfoHint>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: 'How Tokens per second is calculated',
    children:
      "The median streamed call's generation speed over the last 30 days.",
  },
};

export const BesideAStatus: Story = {
  args: {
    size: 'medium',
    label: 'Why Qwentin is not accepted',
    children: 'resolve ModelConfig "qwen3-4b-instruct": not found',
  },
  render: args => (
    <Flex align="center" gap="1">
      <StatusLabel label="Not accepted" intent="negative" />
      <InfoHint {...args} />
    </Flex>
  ),
};

export const BesideASmallLabel: Story = {
  args: {
    label: 'How Turns is counted',
    children: 'Every model call in the window, including tool round-trips.',
  },
  render: args => (
    <Flex align="center" gap="1">
      <Text variant="body-x-small" color="secondary">
        TURNS
      </Text>
      <InfoHint {...args} />
    </Flex>
  ),
};
