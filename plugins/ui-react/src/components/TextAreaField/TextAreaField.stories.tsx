import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { TextAreaField } from './TextAreaField';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/TextAreaField',
  component: TextAreaField,
  tags: ['autodocs'],
  args: {
    label: 'Instructions',
    description: 'What the agent should do, in your own words.',
    value: '',
    onChange: () => {},
    rows: 4,
  },
  // Controlled: the story keeps the value, as a form does.
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return <TextAreaField {...args} value={value} onChange={setValue} />;
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A multi-line text field with a label, a description, an optional character counter and an error.',
          whenToUse:
            'For long free text in a form — instructions, a description — when it needs a counter (`maxLength`), monospace (`mono`) or the portal’s error presentation. For a plain multi-line field, bui `TextAreaField` is enough.',
          migration: 'mixed',
        }),
      },
    },
  },
} satisfies Meta<typeof TextAreaField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithCounter: Story = {
  args: { maxLength: 200, value: 'Review every pull request in the repo.' },
};

export const Monospace: Story = {
  args: { label: 'Values', mono: true, value: 'replicas: 2\nimage: nginx' },
};

export const WithError: Story = {
  args: { error: 'Instructions are required' },
};
