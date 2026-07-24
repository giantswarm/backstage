import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import type { JSONSchema7 } from 'json-schema';
import { YamlEditorFormField } from './YamlEditorFormField';
import { componentDocs } from '../../storybook/docs';

const initial = ['replicas: 3', 'image:', '  tag: latest', ''].join('\n');

const schema: JSONSchema7 = {
  type: 'object',
  properties: {
    replicas: { type: 'integer' },
    image: {
      type: 'object',
      properties: { tag: { type: 'string' } },
    },
  },
};

const meta = {
  title: 'Components/YamlEditorFormField',
  component: YamlEditorFormField,
  tags: ['autodocs'],
  args: {
    label: 'Helm values',
    helperText:
      'Override the chart defaults. Validated against the values schema.',
    value: initial,
    height: 220,
    schema,
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A form-field wrapper around `YamlEditor`: adds an MUI `FormLabel`, an ' +
            'optional helper-text tooltip, and `required`/`disabled`/`error` form ' +
            'states, and drives the editor’s light/dark theme from the app theme.',
          whenToUse:
            'When a YAML editor is one field in a form (e.g. a scaffolder step or a ' +
            'settings panel) and needs a label, help text, and error styling. For a ' +
            'bare editor, use `YamlEditor` directly.',
          migration: 'mui-v4',
        }),
      },
    },
  },
} satisfies Meta<typeof YamlEditorFormField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  render: args => {
    const [value, setValue] = useState(args.value);
    return <YamlEditorFormField {...args} value={value} onChange={setValue} />;
  },
  parameters: {
    docs: {
      description: {
        story: 'Controlled field with a label and a helper-text info tooltip.',
      },
    },
  },
};

export const Required: Story = {
  args: { required: true },
};

export const ErrorState: Story = {
  name: 'Error',
  args: { error: true, helperText: 'Invalid YAML' },
  parameters: {
    docs: {
      description: {
        story:
          'The `error` state marks the label and reddens the editor border.',
      },
    },
  },
};
