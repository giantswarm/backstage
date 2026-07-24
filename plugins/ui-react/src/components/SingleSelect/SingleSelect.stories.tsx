import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { SingleSelect, type SingleSelectProps } from './SingleSelect';
import { componentDocs } from '../../storybook/docs';

const items = [
  { label: 'AWS', value: 'aws' },
  { label: 'Azure', value: 'azure' },
  { label: 'Google Cloud (CAPG)', value: 'gcp' },
  { label: 'VMware vSphere', value: 'vsphere' },
];

const meta = {
  title: 'Components/SingleSelect',
  component: SingleSelect,
  tags: ['autodocs'],
  args: {
    label: 'Provider',
    items,
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A labelled single-choice control rendered as a bordered radio group. ' +
            'Controlled via `selected`, reset via the `triggerReset` toggle, with ' +
            'per-item disabling.',
          whenToUse:
            'For a small, always-visible set of mutually-exclusive options in a ' +
            'filter sidebar or form. For a long list, prefer `Autocomplete`; for ' +
            'multi-choice use `MultipleSelect`.',
          migration: 'mui-v4',
        }),
      },
    },
  },
} satisfies Meta<typeof SingleSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

// A small component so the interactive story can own selection state (hooks
// belong in a component, not a bare `render` callback).
const SingleSelectExample = (args: SingleSelectProps) => {
  const [selected, setSelected] = useState<string | null>('aws');
  return <SingleSelect {...args} selected={selected} onChange={setSelected} />;
};

export const Interactive: Story = {
  render: args => <SingleSelectExample {...args} />,
  parameters: {
    docs: {
      description: { story: 'A fully interactive, controlled radio group.' },
    },
  },
};

export const WithDisabledItem: Story = {
  args: { selected: 'aws', disabledItems: ['vsphere'] },
  parameters: {
    docs: {
      description: {
        story:
          '`disabledItems` greys out individual options while keeping them visible.',
      },
    },
  },
};

export const Disabled: Story = {
  args: { selected: 'azure', disabled: true },
  parameters: {
    docs: { description: { story: 'The whole control is disabled.' } },
  },
};
