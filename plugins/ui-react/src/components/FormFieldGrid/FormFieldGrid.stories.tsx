import type { Meta, StoryObj } from '@storybook/react';
import { TextField } from '@backstage/ui';
import { FormFieldGrid } from './FormFieldGrid';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/FormFieldGrid',
  component: FormFieldGrid,
  tags: ['autodocs'],
  args: {
    children: [
      <TextField key="name" label="Name" />,
      <TextField key="namespace" label="Namespace" />,
      <TextField key="description" label="Description" />,
      <TextField key="owner" label="Owner" />,
    ],
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'Lays a form’s fields out in two columns where there is room, one on a phone.',
          whenToUse:
            'For a create or edit form with several short fields side by side. Pass `columns={1}` for a form whose fields are long.',
          migration: 'mui-v4',
        }),
      },
    },
  },
} satisfies Meta<typeof FormFieldGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TwoColumns: Story = {};

export const OneColumn: Story = {
  args: { columns: 1 },
};
