import type { Meta, StoryObj } from '@storybook/react';
import { Route, Routes } from 'react-router-dom';
import { RouteTabs } from './RouteTabs';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/RouteTabs',
  component: RouteTabs,
  tags: ['autodocs'],
  args: {
    tabs: [
      { id: 'tools', path: '', title: 'Tools', count: 12 },
      { id: 'resources', path: 'resources', title: 'Resources', count: 0 },
      { id: 'prompts', path: 'prompts', title: 'Prompts' },
      { id: 'overview', path: 'overview', title: 'Overview' },
    ],
    search: '?installation=gazelle',
  },
  // The tabs build their links from the splat route they are mounted in.
  decorators: [
    Story => (
      <Routes>
        <Route path="/mcp-servers/:server/*" element={<Story />} />
      </Routes>
    ),
  ],
  parameters: {
    router: { initialEntries: ['/mcp-servers/kubernetes'] },
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A tab strip whose tabs are routes below a page: links whose ' +
            'active state follows the URL, keeping the page’s query string.',
          whenToUse:
            'On a detail page whose sections each have a URL (a server page’s ' +
            'Tools · Resources · Overview, a workflow’s Overview · Run), ' +
            'rendered inside the page’s splat route with the ' +
            'page’s own `<Routes>` below it. For tabs that only switch local ' +
            'state, use bui `Tabs` directly.',
          migration: 'bui',
        }),
      },
    },
  },
} satisfies Meta<typeof RouteTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IndexSelected: Story = {};

export const SubTabSelected: Story = {
  parameters: {
    router: { initialEntries: ['/mcp-servers/kubernetes/overview'] },
  },
};

/**
 * Customize's six tabs with counts. At phone width (≤ 599.95px — pick a
 * mobile viewport) the strip scrolls sideways in one row: the selected tab
 * scrolled into view, a fade at each edge with more tabs beyond it.
 */
export const ManyTabs: Story = {
  args: {
    tabs: [
      { id: 'agents', path: '', title: 'Agents', count: 6 },
      { id: 'skills', path: 'skills', title: 'Skills', count: 12 },
      { id: 'connectors', path: 'connectors', title: 'Connectors', count: 4 },
      { id: 'models', path: 'models', title: 'Models', count: 1 },
      { id: 'workflows', path: 'workflows', title: 'Workflows', count: 9 },
      { id: 'tools', path: 'tools', title: 'Tools', count: 128 },
    ],
  },
  parameters: {
    router: { initialEntries: ['/mcp-servers/kubernetes/workflows'] },
  },
};

/**
 * Customize's tabs while their counts load (`count: 'loading'`): a skeleton
 * holds each count's place, as wide as two digits, so the strip already has
 * its final layout. Compare with `ManyTabs`: up to 99 nothing moves when the
 * counts arrive; Tools' 128 outgrows its slot.
 */
export const CountsLoading: Story = {
  args: {
    tabs: [
      { id: 'agents', path: '', title: 'Agents', count: 'loading' },
      { id: 'skills', path: 'skills', title: 'Skills', count: 'loading' },
      {
        id: 'connectors',
        path: 'connectors',
        title: 'Connectors',
        count: 'loading',
      },
      { id: 'models', path: 'models', title: 'Models', count: 'loading' },
      {
        id: 'workflows',
        path: 'workflows',
        title: 'Workflows',
        count: 'loading',
      },
      { id: 'tools', path: 'tools', title: 'Tools', count: 'loading' },
    ],
  },
  parameters: {
    router: { initialEntries: ['/mcp-servers/kubernetes/workflows'] },
  },
};
