import type { Meta, StoryObj } from '@storybook/react';
import { MultiplePicker } from './MultiplePicker';
import { componentDocs } from '../../storybook/docs';

const options = [
  { label: 'aws', value: 'aws', count: 42 },
  { label: 'azure', value: 'azure', count: 8 },
  { label: 'gcp', value: 'gcp', count: 15 },
  { label: 'vsphere', value: 'vsphere', count: 3 },
];

const meta = {
  title: 'Components/MultiplePicker',
  component: MultiplePicker,
  tags: ['autodocs'],
  args: {
    label: 'Provider',
    queryParameter: 'provider',
    options,
    // eslint-disable-next-line no-console
    onSelect: values => console.log('selected', values),
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A URL-aware multi-select filter. Seeds its selection from a query ' +
            'parameter, keeps it in sync, and calls `onSelect` with the current ' +
            'values. Renders as a checkbox group by default, or an autocomplete ' +
            'when `autocomplete` is set.',
          whenToUse:
            'As a facet in a filter sidebar (see `FiltersLayout`) where the ' +
            'selection should survive reloads/links via the URL. For a plain ' +
            'controlled multi-select without URL wiring, use `MultipleSelect`.',
          migration: 'mui-v4',
        }),
      },
    },
  },
} satisfies Meta<typeof MultiplePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Checkboxes: Story = {
  parameters: {
    docs: { description: { story: 'Default: a checkbox group.' } },
  },
};

export const AsAutocomplete: Story = {
  args: { autocomplete: true },
  parameters: {
    docs: {
      description: {
        story:
          'With `autocomplete`, the same picker renders as a typeahead select.',
      },
    },
  },
};
