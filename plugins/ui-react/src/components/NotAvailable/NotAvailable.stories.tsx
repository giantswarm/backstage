import type { Meta, StoryObj } from '@storybook/react';
import { Typography } from '@material-ui/core';
import { NotAvailable } from './NotAvailable';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/NotAvailable',
  component: NotAvailable,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A tiny, accessible “not available” marker: renders `n/a` inside an ' +
            '`<abbr>` with an `aria-label` of "no information available".',
          whenToUse:
            'Whenever a value is missing/unknown and you want a consistent, ' +
            'screen-reader-friendly placeholder instead of an empty cell or a ' +
            'hand-typed "n/a". `AsyncValue` and `ErrorStatus` use it internally.',
          migration: 'none',
        }),
      },
    },
  },
} satisfies Meta<typeof NotAvailable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Inline: Story = {
  render: () => (
    <Typography variant="body1">
      Kubernetes version: <NotAvailable />
    </Typography>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Reads naturally inline next to a label, at the surrounding font size.',
      },
    },
  },
};
