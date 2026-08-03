import type { Meta, StoryObj } from '@storybook/react';
import { Box } from '@backstage/ui';
import { ConditionsList, ConditionLike } from './ConditionsList';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/ConditionsList',
  component: ConditionsList,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            "A resource's Kubernetes status conditions as a list of " +
            'collapsible entries — the "why is this thing not working" view. ' +
            'Each row shows the condition type, whether it is satisfied, and ' +
            "when it last changed; expanding one reveals the controller's " +
            '`reason` and `message`.',
          whenToUse:
            'On a resource details page, whenever the reader may need to debug ' +
            'an unhealthy resource. Newest transition sorts first and the first ' +
            'failing condition starts expanded, so the reason something just ' +
            'broke is visible without a click. Pass `isFailing` for resources ' +
            'with abnormal-true conditions (`Stalled`, `UnsupportedFeatures`), ' +
            'where `status: True` is the bad news.',
          migration: 'mixed',
          extra:
            'Presentation only — fetch the conditions yourself and pass them ' +
            'in. The message body reuses `ConditionMessage`, so long ' +
            'controller output scrolls inside the panel rather than stretching ' +
            'the page.',
        }),
      },
    },
  },
  decorators: [
    Story => (
      <Box style={{ maxWidth: 640 }}>
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof ConditionsList>;

export default meta;
type Story = StoryObj<typeof meta>;

const healthy: ConditionLike[] = [
  {
    type: 'Accepted',
    status: 'True',
    reason: 'Reconciled',
    message: 'Agent configuration accepted',
    lastTransitionTime: '2026-07-31T10:00:00Z',
  },
  {
    type: 'Ready',
    status: 'True',
    reason: 'DeploymentReady',
    message: 'Deployment is ready',
    lastTransitionTime: '2026-07-31T10:02:00Z',
  },
];

export const AllSatisfied: Story = {
  args: { conditions: healthy },
};

export const WithFailure: Story = {
  name: 'With a failure (auto-expanded)',
  args: {
    conditions: [
      healthy[0],
      {
        type: 'Ready',
        status: 'False',
        reason: 'DeploymentNotReady',
        message: 'Deployment is not ready, 0/1 pods are ready',
        lastTransitionTime: '2026-07-31T10:05:00Z',
      },
    ],
  },
};

export const UnknownStatus: Story = {
  name: 'Unknown status (warning, not failure)',
  args: {
    conditions: [
      healthy[0],
      {
        type: 'Ready',
        status: 'Unknown',
        reason: 'DeploymentNotFound',
        message: 'deployments.apps "pr-reviewer" not found',
        lastTransitionTime: '2026-07-31T10:05:00Z',
      },
    ],
  },
};

export const AbnormalTrue: Story = {
  name: 'Abnormal-true condition (custom isFailing)',
  args: {
    conditions: [
      ...healthy,
      {
        type: 'UnsupportedFeatures',
        status: 'True',
        reason: 'UnsupportedFeatures',
        message: 'memory is not supported by the go runtime',
        lastTransitionTime: '2026-07-31T10:03:00Z',
      },
    ],
    isFailing: condition =>
      condition.type === 'UnsupportedFeatures'
        ? condition.status === 'True'
        : condition.status !== 'True',
  },
};

export const LongMessage: Story = {
  args: {
    conditions: [
      {
        type: 'Accepted',
        status: 'False',
        reason: 'ReconcileFailed',
        message: [
          'failed to reconcile agent: admission webhook',
          '"validation.kagent.dev" denied the request:',
          'spec.declarative.modelConfig: modelconfigs.kagent.dev "opus-4-7"',
          'not found in namespace "agentic-platform"',
        ].join('\n'),
        lastTransitionTime: '2026-07-31T10:05:00Z',
      },
    ],
  },
};

export const Empty: Story = {
  name: 'No conditions yet',
  args: {
    conditions: [],
    emptyContent: 'The controller has not reported a status yet.',
  },
};
