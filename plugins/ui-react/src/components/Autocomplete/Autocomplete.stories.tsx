import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Autocomplete } from './Autocomplete';
import { componentDocs } from '../../storybook/docs';

const items = [
  { label: 'aws', value: 'aws', count: 42 },
  { label: 'azure', value: 'azure', count: 8 },
  { label: 'gcp', value: 'gcp', count: 15 },
  { label: 'vsphere', value: 'vsphere', count: 3 },
  { label: 'cloud-director', value: 'cloud-director', count: 1 },
];

const meta = {
  title: 'Components/Autocomplete',
  component: Autocomplete,
  tags: ['autodocs'],
  // Default args cover the required props; each story is controlled via `render`.
  args: { label: 'Provider', items },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A GS-styled autocomplete (typeahead) select over `{ label, value, ' +
            'count? }` items, in single- or multi-select mode. Options show an ' +
            'optional count; multi-select shows checkboxes and chip tags.',
          whenToUse:
            'For choosing from a long list where typing to filter helps. For a ' +
            'short, always-visible set, use `SingleSelect`/`MultipleSelect`. This is ' +
            'the control `MultiplePicker` uses when `autocomplete` is set.',
          migration: 'mui-v4',
          extra: 'Built on `@material-ui/lab` `Autocomplete` (deprecated).',
        }),
      },
    },
  },
} satisfies Meta<typeof Autocomplete>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {
  render: () => {
    const [value, setValue] = useState<string | null>('aws');
    return (
      <Autocomplete
        label="Provider"
        items={items}
        selectedValue={value}
        onChange={setValue}
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story: 'Single-select. Each option shows its `count` in parentheses.',
      },
    },
  },
};

export const Multiple: Story = {
  render: () => {
    const [values, setValues] = useState<string[]>(['aws', 'gcp']);
    return (
      <Autocomplete
        label="Providers"
        items={items}
        selectedValue={values}
        onChange={setValues}
        multiple
      />
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Multi-select: checkboxes in the list, chips for the current selection.',
      },
    },
  },
};
