import type { Meta, StoryObj } from '@storybook/react';
import { FileView } from './FileView';
import { componentDocs } from '../../storybook/docs';

const DOCKERFILE = [
  'FROM gsoci.azurecr.io/giantswarm/alpine:3.20',
  'RUN apk add --no-cache git jq kubectl helm',
  'USER 1000',
].join('\n');

const MANIFEST = [
  'apiVersion: helm.toolkit.fluxcd.io/v2',
  'kind: HelmRelease',
  'metadata:',
  '  name: example-agent',
  '  namespace: kagent',
  'spec:',
  '  interval: 10m',
  '  chart:',
  '    spec:',
  '      chart: agent',
  '      version: 1.0.0',
  '      sourceRef:',
  '        kind: OCIRepository',
  '        name: example-agent',
  '  values:',
  '    name: example-agent',
  '    harness: kagent',
].join('\n');

const meta = {
  title: 'Components/FileView',
  component: FileView,
  tags: ['autodocs'],
  args: {
    content: DOCKERFILE,
    filename: 'Dockerfile',
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A read-only view of a file: a header with a file icon, the file ' +
            'name, an optional muted path and a copy button, above the ' +
            'content. YAML renders in a read-only `YamlEditor` capped at ' +
            '520px; other text in a plain block that scrolls sideways.',
          whenToUse:
            'To show a file a person reviews or copies whole: a generated ' +
            'manifest, a values file, a Dockerfile. A command or a log is not ' +
            'a file; show it in a `CodeBlock`, with a `Text` heading where it ' +
            'needs one.',
          migration: 'mixed',
          extra:
            'The header is bui (`Flex`, `Text`) with the shared `CopyButton`; ' +
            'the block styling uses MUI v4 `makeStyles`, and the YAML view is ' +
            '`YamlEditor`.',
        }),
      },
    },
  },
} satisfies Meta<typeof FileView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithPath: Story = {
  name: 'With a path',
  args: { path: 'toolchains/go' },
  parameters: {
    docs: {
      description: {
        story:
          '`path` is shown muted after the file name and is cut short with an ' +
          'ellipsis when the header runs out of room.',
      },
    },
  },
};

export const Yaml: Story = {
  name: 'YAML',
  args: {
    content: MANIFEST,
    filename: 'example-agent.yaml',
    language: 'yaml',
  },
};
