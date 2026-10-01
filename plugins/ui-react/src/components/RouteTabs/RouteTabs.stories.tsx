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
