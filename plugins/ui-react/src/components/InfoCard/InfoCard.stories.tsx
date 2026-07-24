import type { Meta, StoryObj } from '@storybook/react';
import { Button, Text } from '@backstage/ui';
import { InfoCard } from './InfoCard';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/InfoCard',
  component: InfoCard,
  tags: ['autodocs'],
  args: {
    title: 'Cluster details',
    children: (
      <Text>
        A titled content card with an optional header-actions area and a
        right-aligned footer-actions area.
      </Text>
    ),
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A titled content card built on the bui `Card`, with GS conventions ' +
            'baked in: a bold `title-x-small` heading, an optional right-aligned ' +
            'header-actions slot, a body, and an optional right-aligned footer.',
          whenToUse:
            'Reach for this instead of hand-rolling a bui `Card` every time you ' +
            'need a titled panel — it gives every card the same header/footer ' +
            'layout. It also stretches to full height, so cards in a grid row line ' +
            'up.',
          migration: 'bui',
          extra:
            'Uses a small amount of MUI v4 `makeStyles` only for `height: 100%` and ' +
            'footer alignment; the card itself is bui.',
        }),
      },
    },
  },
} satisfies Meta<typeof InfoCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHeaderActions: Story = {
  args: {
    headerActions: (
      <Button variant="secondary" size="small">
        Edit
      </Button>
    ),
  },
  parameters: {
    docs: {
      description: {
        story: 'Header actions render right-aligned next to the title.',
      },
    },
  },
};

export const WithFooterActions: Story = {
  args: {
    footerActions: <Button variant="primary">Save</Button>,
  },
  parameters: {
    docs: {
      description: {
        story: 'Footer actions render right-aligned in a `CardFooter`.',
      },
    },
  },
};

export const Untitled: Story = {
  args: { title: undefined },
  parameters: {
    docs: {
      description: {
        story:
          'With no `title`, the header is omitted and only the body renders.',
      },
    },
  },
};
