import type { Meta, StoryObj } from '@storybook/react';
import { MoreActionsMenu } from './MoreActionsMenu';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/MoreActionsMenu',
  component: MoreActionsMenu,
  tags: ['autodocs'],
  args: {
    items: [
      { id: 'edit-in-git', label: 'Edit in Git…', onAction: () => {} },
      {
        id: 'view-source',
        label: 'View source',
        href: 'https://github.com/giantswarm/backstage',
        newTab: true,
      },
      { id: 'remove', label: 'Remove…', danger: true, onAction: () => {} },
    ],
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A page header’s “More actions” ⋮ menu, built from a list of items. It renders nothing for an empty list.',
          whenToUse:
            'In `ShellPage`’s `menu` slot, for the actions that do not earn a header button. Leave out an action that cannot run, because a menu item cannot say why; show the button disabled through `DisabledAction` when the whole menu is unavailable.',
          migration: 'bui',
        }),
      },
    },
  },
} satisfies Meta<typeof MoreActionsMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
