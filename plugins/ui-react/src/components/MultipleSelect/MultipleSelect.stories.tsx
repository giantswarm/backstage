import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { MultipleSelect } from './MultipleSelect';
import { componentDocs } from '../../storybook/docs';

const items = [
  { label: 'Ready', value: 'ready' },
  { label: 'Creating', value: 'creating' },
  { label: 'Deleting', value: 'deleting' },
  { label: 'Upgrading', value: 'upgrading' },
];

const meta = {
  title: 'Components/MultipleSelect',
  component: MultipleSelect,
  tags: ['autodocs'],
  args: {
    label: 'Status',
    items,
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A labelled multi-choice control rendered as a bordered checkbox group. ' +
            'Controlled via `selected`, reset via `triggerReset`, with per-item ' +
            'disabling.',
          whenToUse:
            'For a small, always-visible set of options where several can be picked ' +
            '(e.g. a status filter). For single-choice use `SingleSelect`; for the ' +
            'URL-synced filter variant use `MultiplePicker`.',
          migration: 'mui-v4',
        }),
      },
    },
  },
} satisfies Meta<typeof MultipleSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  render: args => {
    const [selected, setSelected] = useState<string[]>(['ready']);
    return (
      <MultipleSelect {...args} selected={selected} onChange={setSelected} />
    );
  },
  parameters: {
    docs: {
      description: { story: 'A fully interactive, controlled checkbox group.' },
    },
  },
};

export const WithDisabledItem: Story = {
  args: { selected: ['ready'], disabledItems: ['deleting'] },
};
