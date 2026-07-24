import type { Meta, StoryObj } from '@storybook/react';
import { ErrorStatus } from './ErrorStatus';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/ErrorStatus',
  component: ErrorStatus,
  tags: ['autodocs'],
  args: {
    errorMessage: 'Failed to load cluster status: request timed out',
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A compact inline error indicator: an `n/a` marker plus a red error ' +
            'icon whose tooltip carries the full message. Keeps the failure ' +
            'discreet in a table cell while remaining discoverable on hover.',
          whenToUse:
            'When a single value failed to load and you want to show that inline ' +
            'without pushing an error banner. `AsyncValue` renders this by default ' +
            'when its `errorMessage` is set.',
          migration: 'mui-v4',
        }),
      },
    },
  },
} satisfies Meta<typeof ErrorStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutNotAvailable: Story = {
  args: { notAvailable: false },
  parameters: {
    docs: {
      description: {
        story:
          'With `notAvailable={false}` only the error icon shows — use when the ' +
          '“no value” state is already conveyed elsewhere.',
      },
    },
  },
};
