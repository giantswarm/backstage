import type { Meta, StoryObj } from '@storybook/react';
import { DraftRestoredAlert } from './DraftRestoredAlert';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/DraftRestoredAlert',
  component: DraftRestoredAlert,
  tags: ['autodocs'],
  args: {
    keptUntil:
      'It is kept in this browser tab until you create the agent or discard it.',
    onStartOver: () => {},
    onDismiss: () => {},
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'Says that a form came back with the draft `useSessionDraft` kept, ' +
            'with **Start over** (confirmed first) and a close button that keeps ' +
            'the draft.',
          whenToUse:
            'At the top of a form or wizard step while its draft was restored, ' +
            'until the person closes it or starts over.',
          migration: 'mixed',
          extra: 'The close icon and the corner alignment are MUI v4.',
        }),
      },
    },
  },
} satisfies Meta<typeof DraftRestoredAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
