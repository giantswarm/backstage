import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { TextField } from '@backstage/ui';
import { MoreOptions } from './MoreOptions';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/MoreOptions',
  component: MoreOptions,
  tags: ['autodocs'],
  args: {
    open: false,
    onOpenChange: () => {},
    summary: 'technical name sonnet-4-5',
    children: <TextField label="Technical name" defaultValue="sonnet-4-5" />,
  },
  // Controlled: the story keeps the open state, as a form does.
  render: function Render(args) {
    const [open, setOpen] = useState(args.open);
    return <MoreOptions {...args} open={open} onOpenChange={setOpen} />;
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            '"More options": the technical fields of a create or edit flow, folded away under the plain ones.',
          whenToUse:
            'For fields whose defaults fit most cases. Name the current values in `summary`, so the defaults are never a surprise. A form whose submit is blocked by a field inside opens it in the same handler as `useFieldValidation`’s `reveal()`.',
          migration: 'mui-v4',
        }),
      },
    },
  },
} satisfies Meta<typeof MoreOptions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

export const Open: Story = {
  args: { open: true },
};
