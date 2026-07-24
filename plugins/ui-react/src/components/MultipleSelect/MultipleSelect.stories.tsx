import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { MultipleSelect, type MultipleSelectProps } from './MultipleSelect';
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

// A small component so the interactive story can own selection state (hooks
// belong in a component, not a bare `render` callback).
const MultipleSelectExample = (args: MultipleSelectProps) => {
  const [selected, setSelected] = useState<string[]>(['ready']);
  return (
    <MultipleSelect {...args} selected={selected} onChange={setSelected} />
  );
};

export const Interactive: Story = {
  render: args => <MultipleSelectExample {...args} />,
  parameters: {
    docs: {
      description: { story: 'A fully interactive, controlled checkbox group.' },
    },
  },
};

export const WithDisabledItem: Story = {
  args: { selected: ['ready'], disabledItems: ['deleting'] },
};
