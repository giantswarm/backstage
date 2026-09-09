import type { Meta, StoryObj } from '@storybook/react';
import { Button, TextField } from '@backstage/ui';
import { EmptyStateCard } from './EmptyStateCard';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/EmptyStateCard',
  component: EmptyStateCard,
  tags: ['autodocs'],
  args: {
    title: 'No agents yet',
    description:
      'Agents are assistants that run on your management clusters. Create your first one to get started.',
    actions: <Button variant="primary">Create your first agent</Button>,
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A full-width bordered card with centred, larger-than-body copy and a ' +
            'call to action — the "there is nothing here yet" state of a list.',
          whenToUse:
            'For the first-run state of a page whose content is a table or a list. ' +
            'An empty table with column headers says nothing about what the rows ' +
            'are or how to create one; this says both and offers the next step. ' +
            'For a value that is merely missing, reach for `NotAvailable`; for a ' +
            'read that failed, an `Alert`.',
          migration: 'bui',
          extra:
            'The border and the centring come from a small amount of MUI v4 ' +
            '`makeStyles`, because bui exposes no `border` prop and `Text` no ' +
            'alignment prop; the card itself is bui.',
        }),
      },
    },
  },
} satisfies Meta<typeof EmptyStateCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TitleOnly: Story = {
  args: { description: undefined, actions: undefined },
  parameters: {
    docs: {
      description: {
        story:
          'With neither a description nor actions, the card is the title alone.',
      },
    },
  },
};

export const WithContent: Story = {
  args: {
    title: 'Start your first session',
    description: 'Describe what you need and the agent gets to work.',
    actions: undefined,
    children: (
      <TextField aria-label="Prompt" placeholder="What should the agent do?" />
    ),
  },
  parameters: {
    docs: {
      description: {
        story:
          '`children` takes content richer than a button — a prompt composer, a ' +
          'small form — in a centred column of its own, so the invitation *is* ' +
          'the input.',
      },
    },
  },
};
