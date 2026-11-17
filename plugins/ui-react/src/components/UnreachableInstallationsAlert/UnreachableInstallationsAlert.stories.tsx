import type { Meta, StoryObj } from '@storybook/react';
import { UnreachableInstallationsAlert } from './UnreachableInstallationsAlert';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/UnreachableInstallationsAlert',
  component: UnreachableInstallationsAlert,
  tags: ['autodocs'],
  args: {
    installations: ['meadow', 'fennel'],
    failures: {
      meadow: { reason: 'timed out', requestId: '3f2c9a' },
      fennel: { reason: 'permission denied' },
    },
    resourceName: 'clusters',
    onRetry: () => {},
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'Names the environments whose resources could not be read, with each reason: a closable warning above a list that shows the rest, or a danger card when the failure is the whole answer. Optional “Try again” and page-specific actions.',
          whenToUse:
            'On any shell list read across environments, once the reads have answered (`isLoading`). Pass `everything` when nothing else could be read, so the page never claims the list is empty.',
          migration: 'bui',
        }),
      },
    },
  },
} satisfies Meta<typeof UnreachableInstallationsAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Warning: Story = {};

export const Everything: Story = {
  args: { everything: { title: 'Could not read your clusters' } },
};
