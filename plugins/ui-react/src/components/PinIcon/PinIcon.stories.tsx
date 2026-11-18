import type { Meta, StoryObj } from '@storybook/react';
import { ButtonIcon, Flex, Text } from '@backstage/ui';
import { PinIcon } from './PinIcon';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/PinIcon',
  component: PinIcon,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A push-pin glyph: an outline to offer pinning, solid once the ' +
            'thing is pinned.',
          whenToUse:
            'On the control that pins or unpins something, such as a session ' +
            'in a list or its actions menu. It is an inline SVG because the ' +
            '`@material-ui/icons` v4 set has no push-pin. The glyph is ' +
            'decorative (`aria-hidden`), so the button around it carries the ' +
            'label, and it takes its colour from `currentColor`.',
          migration: 'none',
        }),
      },
    },
  },
} satisfies Meta<typeof PinIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { filled: false, size: 16 },
};

export const States: Story = {
  render: () => (
    <Flex align="center" gap="4">
      <Flex direction="column" align="center" gap="1">
        <PinIcon />
        <Text variant="body-small">Not pinned</Text>
      </Flex>
      <Flex direction="column" align="center" gap="1">
        <PinIcon filled />
        <Text variant="body-small">Pinned</Text>
      </Flex>
    </Flex>
  ),
};

export const Sizes: Story = {
  render: () => (
    <Flex align="center" gap="3">
      <PinIcon size={14} />
      <PinIcon size={16} />
      <PinIcon size={17} />
      <PinIcon size={24} />
    </Flex>
  ),
  parameters: {
    docs: {
      description: {
        story: '`size` sets width and height in pixels; the default is 16.',
      },
    },
  },
};

export const InAButton: Story = {
  name: 'In a button',
  render: () => (
    <Flex align="center" gap="2">
      <ButtonIcon
        aria-label="Pin session"
        variant="tertiary"
        icon={<PinIcon />}
      />
      <ButtonIcon
        aria-label="Unpin session"
        variant="tertiary"
        icon={<PinIcon filled />}
      />
    </Flex>
  ),
};
