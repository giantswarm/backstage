import type { Meta, StoryObj } from '@storybook/react';
import { ContentRow } from './ContentRow';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/ContentRow',
  component: ContentRow,
  tags: ['autodocs'],
  args: {
    title: 'Namespace',
    children: 'org-giantswarm',
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A single label/value pair: a bold title stacked above its ' +
            '`body-medium` content.',
          whenToUse:
            'For simple stacked “key / value” lines. For a full metadata block with ' +
            'many rows and responsive key/value columns, prefer ' +
            '`StructuredMetadataList` instead.',
          migration: 'bui',
        }),
      },
    },
  },
} satisfies Meta<typeof ContentRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Stacked: Story = {
  render: () => (
    <div>
      <ContentRow title="Name">production</ContentRow>
      <ContentRow title="Provider">aws</ContentRow>
      <ContentRow title="Region">eu-central-1</ContentRow>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Several rows stacked to form a small detail list.',
      },
    },
  },
};
