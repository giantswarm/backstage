import type { Meta, StoryObj } from '@storybook/react';
import { MetricsUnavailableAlert } from './MetricsUnavailableAlert';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/MetricsUnavailableAlert',
  component: MetricsUnavailableAlert,
  tags: ['autodocs'],
  args: {
    error: new Error('Mimir query failed with status 503'),
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'The warning shown in place of figures that could not be read ' +
            'from Mimir. When the gs backend says why (`error.reason`), it ' +
            'uses the shared words from `describeMimirFailure`; otherwise the ' +
            "caller's title and description.",
          whenToUse:
            'In a card or section whose Mimir query failed. Where only a line ' +
            'of text fits, use `describeMimirFailure(error)` for the same words.',
          migration: 'bui',
        }),
      },
    },
  },
} satisfies Meta<typeof MetricsUnavailableAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Mimir failed some other way: the caller's generic words. */
export const Default: Story = {};

export const WithDescription: Story = {
  args: {
    title: 'Gateway API metrics could not be loaded.',
    description: 'Mimir could not answer the query (HTTP 500).',
  },
};

/**
 * Mimir has no healthy store-gateway: data older than a few hours cannot be
 * read until one is back.
 */
export const OlderDataUnavailable: Story = {
  args: {
    error: Object.assign(new Error('Mimir could not answer the query'), {
      reason: 'older_data_unavailable',
    }),
  },
};
