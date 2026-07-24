import type { Meta, StoryObj } from '@storybook/react';
import { ExternalLink } from '../ExternalLink';
import { StructuredMetadataList } from './StructuredMetadataList';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/StructuredMetadataList',
  component: StructuredMetadataList,
  tags: ['autodocs'],
  args: {
    metadata: {
      Name: 'production',
      Provider: 'aws',
      Region: 'eu-central-1',
      'Kubernetes version': 'v1.29.4',
      Organization: 'giantswarm',
    },
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'Renders a `{ key: value }` map as a metadata list. Each value can be a ' +
            'string or any React node. With `fixedKeyColumnWidth` set, it switches ' +
            'to a two-column key/value layout once the container is wide enough, and ' +
            'stacks otherwise (container-query style, via a resize observer).',
          whenToUse:
            'For an entity/resource detail block with several fields. For a single ' +
            'inline “key: value” line, `ContentRow` is lighter.',
          migration: 'mui-v4',
        }),
      },
    },
  },
} satisfies Meta<typeof StructuredMetadataList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Stacked: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Default: each key sits above its value (good for narrow containers).',
      },
    },
  },
};

export const TwoColumn: Story = {
  args: { fixedKeyColumnWidth: '180px' },
  decorators: [
    Story => (
      <div style={{ width: 640 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        story:
          'With `fixedKeyColumnWidth` and a wide-enough container (≥ 500px), keys and ' +
          'values sit in two aligned columns.',
      },
    },
  },
};

export const WithNodeValues: Story = {
  args: {
    metadata: {
      Name: 'production',
      Console: (
        <ExternalLink href="https://example.com">Open console</ExternalLink>
      ),
      Status: <strong style={{ color: 'green' }}>Ready</strong>,
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'Values may be arbitrary React nodes, not just strings.',
      },
    },
  },
};
