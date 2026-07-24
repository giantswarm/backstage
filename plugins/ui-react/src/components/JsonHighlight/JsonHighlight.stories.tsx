import type { Meta, StoryObj } from '@storybook/react';
import { JsonHighlight } from './JsonHighlight';
import { componentDocs } from '../../storybook/docs';

const sample = JSON.stringify(
  {
    apiVersion: 'cluster.x-k8s.io/v1beta1',
    kind: 'Cluster',
    metadata: { name: 'production', namespace: 'org-giantswarm' },
    spec: {
      paused: false,
      controlPlaneRef: { kind: 'AWSManagedControlPlane' },
    },
  },
  null,
  2,
);

const meta = {
  title: 'Components/JsonHighlight',
  component: JsonHighlight,
  tags: ['autodocs'],
  args: {
    children: sample,
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'Syntax-highlights a JSON string, picking a light or dark highlight ' +
            'theme automatically from the active MUI theme. Long lines wrap.',
          whenToUse:
            'To display a (read-only) JSON payload — an API response, a resource ' +
            'manifest, a config blob. For plain shell commands use `CodeBlock`; for ' +
            'an editable YAML surface use `YamlEditor`.',
          migration: 'mui-v4',
          extra:
            'Rendering is provided by `react-syntax-highlighter`; MUI v4 is used ' +
            'only to read `palette.type` for light/dark theme selection.',
        }),
      },
    },
  },
} satisfies Meta<typeof JsonHighlight>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Inline: Story = {
  args: { children: '{ "ready": true, "replicas": 3 }' },
  parameters: {
    docs: {
      description: { story: 'A short single-line object.' },
    },
  },
};
