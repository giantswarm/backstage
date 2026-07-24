import type { Meta, StoryObj } from '@storybook/react';
import { YamlEditor } from './YamlEditor';
import { componentDocs } from '../../storybook/docs';

const sampleYaml = [
  'apiVersion: v1',
  'kind: ConfigMap',
  'metadata:',
  '  name: my-config',
  '  namespace: default',
  'data:',
  '  replicas: "3"',
  '  logLevel: info',
  '',
].join('\n');

const schema = {
  type: 'object',
  properties: {
    apiVersion: { type: 'string' },
    kind: { type: 'string' },
    metadata: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        namespace: { type: 'string' },
      },
      required: ['name'],
    },
  },
  required: ['apiVersion', 'kind'],
};

const meta = {
  title: 'Components/YamlEditor',
  component: YamlEditor,
  tags: ['autodocs'],
  args: {
    initialValue: sampleYaml,
    height: '260px',
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A CodeMirror-based YAML editor with line numbers, folding, bracket ' +
            'matching, and optional JSON-Schema-driven completion and linting. ' +
            'Ships with light/dark VS Code themes.',
          whenToUse:
            'For editing (or read-only viewing) of YAML — Helm values, manifests, ' +
            'scaffolder input. For form integration with a label/helper text use ' +
            '`YamlEditorFormField`, which wraps this.',
          migration: 'mui-v4',
          extra:
            'Editing is provided by CodeMirror; MUI v4 `makeStyles` supplies the ' +
            'wrapper border/background.',
        }),
      },
    },
  },
} satisfies Meta<typeof YamlEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithSchema: Story = {
  args: { schema },
  parameters: {
    docs: {
      description: {
        story:
          'Passing a JSON schema enables schema-aware autocompletion and inline ' +
          'lint diagnostics as you type.',
      },
    },
  },
};

export const ReadOnly: Story = {
  args: { readOnly: true },
  parameters: {
    docs: { description: { story: 'A non-editable view of YAML content.' } },
  },
};

export const ErrorState: Story = {
  name: 'Error',
  args: { error: true },
  parameters: {
    docs: {
      description: {
        story:
          'With `error`, the wrapper border turns red to signal invalid input.',
      },
    },
  },
};
