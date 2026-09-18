import type { Meta, StoryObj } from '@storybook/react';
import { LoadingIndicator } from './LoadingIndicator';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/LoadingIndicator',
  component: LoadingIndicator,
  tags: ['autodocs'],
  args: {
    label: 'Discovering skills…',
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'An indeterminate progress bar above a muted label, for a region ' +
            'that is still loading its contents.',
          whenToUse:
            'When a card or section has nothing to show yet and a bare line of ' +
            'text would leave the page looking static. The label says what is ' +
            'being fetched and doubles as the progress bar’s accessible name. ' +
            'For a single value inside a table cell, prefer `AsyncValue`.',
          migration: 'mixed',
          extra:
            '`Progress` holds the bar back for 250ms, so a fetch that resolves ' +
            'from cache does not flash one.',
        }),
      },
    },
  },
} satisfies Meta<typeof LoadingIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
