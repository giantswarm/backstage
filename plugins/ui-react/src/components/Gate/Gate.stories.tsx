import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '@material-ui/core';
import Lock from '@material-ui/icons/Lock';
import ExitToApp from '@material-ui/icons/ExitToApp';
import { Gate } from './Gate';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/Gate',
  component: Gate,
  tags: ['autodocs'],
  args: {
    label:
      'Tools and core families need a live muster session. Connect to muster to load them.',
    action: (
      <Button
        size="small"
        variant="contained"
        color="primary"
        startIcon={<Lock style={{ fontSize: 14 }} />}
      >
        Connect
      </Button>
    ),
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A dashed-border box with a lock icon, shown in place of content the ' +
            'person cannot see yet, with the action that unlocks it on the right.',
          whenToUse:
            'Wherever a section is withheld for a reason the person can act on: ' +
            'tools behind a live muster session, an installation whose API server ' +
            'rejected their token. Name what is gated and why in the label and ' +
            'put the remedy (Connect, Sign out, Retry) in `action`. For a read ' +
            'that failed for no actionable reason, an `Alert`; for a value that ' +
            'is merely missing, `NotAvailable`.',
          migration: 'mui-v4',
        }),
      },
    },
  },
} satisfies Meta<typeof Gate>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutAction: Story = {
  args: {
    label: 'Checking your muster session on gazelle…',
    action: undefined,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Without an `action` the box is the label alone — the neutral ' +
          '"checking" state before a failure class is known.',
      },
    },
  },
};

export const RejectedToken: Story = {
  args: {
    label:
      'The MCP servers, workflows and tools of an installation are read through ' +
      "its Kubernetes API. The API server of gazelle rejected the portal's token " +
      '(HTTP 401 Unauthorized): your sign-in did not grant what it requires, and ' +
      'a silent refresh cannot repair that. Sign out of the portal and sign in again.',
    action: (
      <Button
        size="small"
        variant="contained"
        color="primary"
        startIcon={<ExitToApp style={{ fontSize: 14 }} />}
      >
        Sign out
      </Button>
    ),
  },
  parameters: {
    docs: {
      description: {
        story:
          'The installation-inventory gate: the API server refused the probe, ' +
          'so the remedy is a fresh sign-in rather than a retry.',
      },
    },
  },
};
