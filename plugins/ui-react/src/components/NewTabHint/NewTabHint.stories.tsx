import type { Meta, StoryObj } from '@storybook/react';
import { NewTabHint } from './NewTabHint';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/NewTabHint',
  component: NewTabHint,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'What marks a link or button that opens a new tab: the launch ' +
            'icon after its text, at the text’s size, and “(opens in a new ' +
            'tab)” for screen readers.',
          whenToUse:
            'Rarely by hand: `ExternalLink`, `ExternalButtonLink` and ' +
            '`ExternalCellText` render it, and `NewTabLabel` for a bui ' +
            '`Button` that opens a tab from code.',
          migration: 'mixed',
        }),
      },
    },
  },
} satisfies Meta<typeof NewTabHint>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InRunningText: Story = {
  render: () => (
    <p>
      Read the docs
      <NewTabHint /> before you start.
    </p>
  ),
};
