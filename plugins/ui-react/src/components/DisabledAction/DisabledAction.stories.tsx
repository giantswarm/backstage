import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '@backstage/ui';
import { DisabledAction } from './DisabledAction';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/DisabledAction',
  component: DisabledAction,
  tags: ['autodocs'],
  args: {
    reason: 'Applied from Git — change it there.',
    children: describedBy => (
      <Button isDisabled aria-describedby={describedBy}>
        Edit
      </Button>
    ),
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A disabled action that still says why it is disabled — on hover, on keyboard focus and on a press.',
          whenToUse:
            'Around a header action a person cannot take right now, when the reason helps them (managed elsewhere, missing permission). A disabled bui `Button` alone cannot show a tooltip: react-aria withholds hover and focus from it.',
          migration: 'mixed',
        }),
      },
    },
  },
} satisfies Meta<typeof DisabledAction>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
