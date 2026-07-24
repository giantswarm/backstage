import type { Meta, StoryObj } from '@storybook/react';
import { ConditionMessage } from './ConditionMessage';
import { componentDocs } from '../../../storybook/docs';

const meta = {
  title: 'Components/display/ConditionMessage',
  component: ConditionMessage,
  tags: ['autodocs'],
  args: {
    message:
      '0/3 nodes are available: 3 node(s) had untolerated taint ' +
      '{node.kubernetes.io/not-ready: }. preemption: 0/3 nodes are available.',
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'Renders a Kubernetes-style condition/status message as monospaced ' +
            '`<code>`, preserving line breaks and scrolling horizontally when a ' +
            'line is too long to wrap.',
          whenToUse:
            'To show a raw condition `message`/`reason` from a resource status (a ' +
            'CAPI condition, an event message) without it breaking the layout on ' +
            'long single lines.',
          migration: 'mui-v4',
        }),
      },
    },
  },
} satisfies Meta<typeof ConditionMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Multiline: Story = {
  args: {
    message: [
      'Reconciliation failed:',
      '  - HelmRelease not ready',
      '  - dependency "cert-manager" not ready',
    ].join('\n'),
  },
  parameters: {
    docs: {
      description: { story: 'Multi-line messages keep their line breaks.' },
    },
  },
};
