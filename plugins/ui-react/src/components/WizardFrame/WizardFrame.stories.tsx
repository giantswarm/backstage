import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '@backstage/ui';
import {
  PageHeaderActionsProvider,
  useProvidePageHeaderActions,
} from '../PageHeaderActions';
import { WizardFrame } from './WizardFrame';
import { WizardStepHeading } from './WizardStepHeading';
import { componentDocs } from '../../storybook/docs';

function ContinueButton() {
  const actions = useMemo(
    () => <Button variant="primary">Continue</Button>,
    [],
  );
  useProvidePageHeaderActions(actions);
  return null;
}

const meta = {
  title: 'Components/WizardFrame',
  component: WizardFrame,
  tags: ['autodocs'],
  args: {
    title: 'New agent',
    context: 'Customize / Agents',
    steps: [
      { id: 'basics', label: 'Basics', href: '#basics' },
      { id: 'skills', label: 'Skills', href: '#skills' },
      { id: 'tools', label: 'Connectors' },
      { id: 'review', label: 'Review' },
    ],
    currentStep: 'tools',
    closeHref: '#customize',
    onBack: () => {},
    children: (
      <>
        <WizardStepHeading title="Choose individual tools">
          The toolset bounds which of the gateway’s tools this agent can
          discover and call.
        </WizardStepHeading>
        <ContinueButton />
      </>
    ),
  },
  decorators: [
    Story => (
      <PageHeaderActionsProvider>
        <div style={{ height: 560, overflowY: 'auto' }}>
          <Story />
        </div>
      </PageHeaderActionsProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A create flow in the content area — the shell’s rail stays ' +
            'visible: Close, the title and a step strip on top, the step in a ' +
            'centered column, Cancel, Back and the step’s own buttons in a ' +
            'sticky footer.',
          whenToUse:
            'For any create flow (new agent, add connector, add skill, add ' +
            'model). The step registers its primary and secondary buttons ' +
            'with `useProvidePageHeaderActions`.',
          migration: 'mixed',
        }),
      },
    },
  },
} satisfies Meta<typeof WizardFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FirstStep: Story = {
  args: { currentStep: 'basics', onBack: undefined },
};

export const WithoutSteps: Story = {
  args: {
    steps: undefined,
    title: 'Add model',
    context: 'Customize / Models',
    width: 'medium',
  },
};
