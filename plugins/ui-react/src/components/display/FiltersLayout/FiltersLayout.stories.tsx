import type { Meta, StoryObj } from '@storybook/react';
import { MultipleSelect } from '../../MultipleSelect';
import { FiltersLayout } from './FiltersLayout';
import { componentDocs } from '../../../storybook/docs';

const meta = {
  title: 'Components/display/FiltersLayout',
  component: FiltersLayout,
  tags: ['autodocs'],
  // The Default story builds its own tree via `render`; satisfy the required prop.
  args: { children: null },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A responsive list-with-filters layout. On wide screens it shows a ' +
            'filter sidebar (`FiltersLayout.Filters`) next to the main content ' +
            '(`FiltersLayout.Content`); below a breakpoint the filters collapse ' +
            'into a “Filters” button that opens them in a drawer.',
          whenToUse:
            'As the shell for any filterable list/table page. Put facet controls ' +
            '(e.g. `MultiplePicker`) in `Filters` and the table in `Content`. ' +
            'Resize the preview to see it collapse to the drawer.',
          migration: 'mui-v4',
        }),
      },
    },
  },
} satisfies Meta<typeof FiltersLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <FiltersLayout>
      <FiltersLayout.Filters>
        <MultipleSelect
          label="Provider"
          items={[
            { label: 'aws', value: 'aws' },
            { label: 'azure', value: 'azure' },
            { label: 'gcp', value: 'gcp' },
          ]}
          selected={['aws']}
        />
      </FiltersLayout.Filters>
      <FiltersLayout.Content>
        <p>
          Main content (e.g. a clusters table) goes here. On a narrow viewport
          the filters move behind a “Filters” button.
        </p>
      </FiltersLayout.Content>
    </FiltersLayout>
  ),
};
