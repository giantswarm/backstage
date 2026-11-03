import type { Meta, StoryObj } from '@storybook/react';
import { Flex } from '@backstage/ui';
// Imported by its own path, never through `@giantswarm/backstage-plugin-muster`:
// the plugin barrel drags the whole plugin graph through Vite.
import { WorkflowEffectBadge } from './WorkflowEffectBadge';

const meta = {
  title: 'Muster/WorkflowEffectBadge',
  component: WorkflowEffectBadge,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: [
          'A workflow’s derived effect: the tool’s `EffectBadge` (“Reads” / “Changes things”), with what that means for its steps in a tooltip — “Every step only reads.” or “At least one step can change things.”',
          '',
          '**When to use it:** wherever a workflow’s own effect is shown — the Workflows list and the workflow page’s header. A step’s tool, the flow legend and every tool list keep the plain `EffectBadge`. Take the effect from `workflowEffect`.',
          '',
          'Hover, keyboard focus (Tab) and a tap open the tooltip; Escape or a press elsewhere closes it, and a screen reader hears the hint as the badge’s description. A press on it does not open the row it sits in.',
        ].join('\n'),
      },
    },
  },
  args: {
    effect: 'reads',
  },
} satisfies Meta<typeof WorkflowEffectBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Both kinds side by side; hover or Tab to one for its hint. */
export const BothEffects: Story = {
  render: () => (
    <Flex gap="2" align="center">
      <WorkflowEffectBadge effect="reads" />
      <WorkflowEffectBadge effect="changes" />
    </Flex>
  ),
};
