import type { Meta, StoryObj } from '@storybook/react';
import { Badge, Flex } from '@backstage/ui';
import { HintTooltip } from './HintTooltip';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/HintTooltip',
  component: HintTooltip,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A hint on something that is not a control, such as a badge or a ' +
            'logo: opens on hover, keyboard focus or a tap, one at a time, ' +
            'and is read as the trigger’s description.',
          whenToUse:
            'When a badge or a logo needs a line of explanation, also on a ' +
            'phone and inside a clickable row. For an info icon beside a ' +
            'label, use `InfoHint`.',
          migration: 'mixed',
        }),
      },
    },
  },
} satisfies Meta<typeof HintTooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    hint: 'At least one step can change things.',
    children: <Badge>Changes things</Badge>,
  },
};

/** Two hints side by side: opening one closes the other. */
export const OneAtATime: Story = {
  args: { hint: '', children: null },
  render: () => (
    <Flex gap="2">
      <HintTooltip hint="Every step only reads.">
        <Badge>Reads</Badge>
      </HintTooltip>
      <HintTooltip hint="At least one step can change things.">
        <Badge>Changes things</Badge>
      </HintTooltip>
    </Flex>
  ),
};
