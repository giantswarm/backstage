import type { Meta, StoryObj } from '@storybook/react';
import { Breadcrumbs } from './Breadcrumbs';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/Breadcrumbs',
  component: Breadcrumbs,
  tags: ['autodocs'],
  args: {
    items: [
      { label: 'MCP Servers', href: '#servers' },
      { label: 'kubernetes', href: '#kubernetes' },
      { label: 'Tools', href: '#tools' },
      { label: 'get_pods' },
    ],
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A trail of links to the ancestors of a page, the current page last ' +
            'and plain, above the page title. A back arrow before the trail ' +
            'leads to the nearest linked ancestor; with none, it is left out.',
          whenToUse:
            'On every page below a list: a tool page beneath its server ' +
            'beneath the servers list, or an agent beneath the agents list. ' +
            '`ShellPage` renders it from its `breadcrumbs`.',
          migration: 'bui',
        }),
      },
    },
  },
} satisfies Meta<typeof Breadcrumbs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OneLevel: Story = {
  args: {
    items: [
      { label: 'MCP Servers', href: '#servers' },
      { label: 'kubernetes' },
    ],
  },
};

export const NoLinkedAncestor: Story = {
  args: {
    items: [{ label: 'Workflows' }, { label: 'rotate_certificates' }],
  },
};
