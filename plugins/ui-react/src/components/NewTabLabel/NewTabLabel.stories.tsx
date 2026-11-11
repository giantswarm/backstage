import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '@backstage/ui';
import { NewTabLabel } from './NewTabLabel';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/NewTabLabel',
  component: NewTabLabel,
  tags: ['autodocs'],
  args: { children: 'Sign in to example' },
  render: args => (
    <Button variant="primary" size="small">
      <NewTabLabel {...args} />
    </Button>
  ),
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A button label followed by `NewTabHint` (the launch icon and ' +
            '“(opens in a new tab)”) in one box, so the button’s gap does not ' +
            'set the icon further off than in a text link.',
          whenToUse:
            'In a bui `Button` that opens a tab from code, such as a ' +
            'sign-in. A `ButtonLink` that opens a new tab is ' +
            '`ExternalButtonLink`, which renders this.',
          migration: 'mixed',
        }),
      },
    },
  },
} satisfies Meta<typeof NewTabLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
