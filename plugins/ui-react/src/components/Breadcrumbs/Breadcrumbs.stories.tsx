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
            'and plain, above the page title.',
          whenToUse:
            'On a page nested more than one level below a list: a tool page ' +
            'beneath its server beneath the servers list. For a page one level ' +
            'down, a single back link ("← Agents") is enough.',
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
