import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Button, Text } from '@backstage/ui';
import {
  PageHeaderActionsProvider,
  useProvidePageHeaderActions,
} from '../PageHeaderActions';
import { FullScreenWizardFrame } from './FullScreenWizardFrame';
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
  title: 'Components/FullScreenWizardFrame',
  component: FullScreenWizardFrame,
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
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 32px' }}>
        <Text as="h2" variant="title-small">
          Choose individual tools
        </Text>
        <ContinueButton />
      </div>
    ),
  },
  // A transformed ancestor contains the frame's fixed position in the canvas.
  decorators: [
    Story => (
      <PageHeaderActionsProvider>
        <div style={{ height: 560, transform: 'translateZ(0)' }}>
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
            'A create flow over the whole viewport: Close, the title and a ' +
            'step strip on top, the step in the middle, Cancel, Back and the ' +
            'step’s own buttons at the bottom.',
          whenToUse:
            'For a create flow inside the agent-platform shell (add a model, ' +
            'add a connector, a new agent’s tools). The step registers its ' +
            'primary and secondary buttons with `useProvidePageHeaderActions`; ' +
            'Escape leaves to `closeHref`.',
          migration: 'mixed',
        }),
      },
    },
  },
} satisfies Meta<typeof FullScreenWizardFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FirstStep: Story = {
  args: { currentStep: 'basics', onBack: undefined },
};

export const WithoutSteps: Story = {
  args: { steps: undefined, title: 'Add model', context: 'Customize / Models' },
};
