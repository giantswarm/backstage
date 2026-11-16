import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ColumnPicker } from './ColumnPicker';
import { componentDocs } from '../../storybook/docs';

const options = [
  { id: 'name', label: 'Name', isFixed: true },
  { id: 'status', label: 'Status' },
  { id: 'environment', label: 'Environment' },
  { id: 'region', label: 'Region' },
  { id: 'created', label: 'Created' },
];

const meta = {
  title: 'Components/ColumnPicker',
  component: ColumnPicker,
  tags: ['autodocs'],
  args: {
    options,
    visible: ['status', 'environment', 'created'],
    onChange: () => {},
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'An icon button at the end of a list’s filter bar that opens the list’s columns, each checked while it shows. A fixed column (the name) is listed checked and cannot be hidden.',
          whenToUse:
            'For a list whose columns a person chooses, with the choice kept by `useTableColumns`. Leave it out at phone width, where the list stacks.',
          migration: 'bui',
        }),
      },
    },
  },
  render: function Render(args) {
    const [visible, setVisible] = useState(args.visible);
    return <ColumnPicker {...args} visible={visible} onChange={setVisible} />;
  },
} satisfies Meta<typeof ColumnPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
