import type { Meta, StoryObj } from '@storybook/react';
import { Route, Routes } from 'react-router-dom';
import { Badge, Button, ButtonIcon, Text } from '@backstage/ui';
import MoreHorizIcon from '@material-ui/icons/MoreHoriz';
import { FactsColumn } from '../FactsColumn';
import { PageHeaderActionsProvider } from '../PageHeaderActions';
import { StatusDot } from '../StatusDot';
import { ShellPage } from './ShellPage';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/ShellPage',
  component: ShellPage,
  tags: ['autodocs'],
  args: {
    title: 'Jira',
    breadcrumbs: [
      { label: 'Customize', href: '#customize' },
      { label: 'Connectors', href: '#connectors' },
      { label: 'Jira' },
    ],
    badges: (
      <Badge size="small">
        <StatusDot tone="success" label="Connected" />
      </Badge>
    ),
    meta: 'Search, read and update tickets',
    actions: <Button variant="secondary">Edit</Button>,
    menu: (
      <ButtonIcon
        variant="tertiary"
        icon={<MoreHorizIcon />}
        aria-label="More actions"
      />
    ),
    tabs: [
      { id: 'tools', path: '', title: 'Tools' },
      { id: 'used-by', path: 'used-by', title: 'Used by' },
      { id: 'settings', path: 'settings', title: 'Settings' },
    ],
    aside: (
      <FactsColumn
        facts={[
          { label: 'Sign-in', value: 'Company login' },
          { label: 'Health', value: '2 of 2 instances healthy' },
        ]}
      />
    ),
    children: <Text>The selected tab’s content.</Text>,
  },
  decorators: [
    Story => (
      <PageHeaderActionsProvider>
        <Routes>
          <Route path="/connectors/:name/*" element={<Story />} />
        </Routes>
      </PageHeaderActionsProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    router: { initialEntries: ['/connectors/jira'] },
    docs: {
      description: {
        component: componentDocs({
          summary:
            'The agent-platform shell’s page frame: breadcrumbs, a 26px title ' +
            'with badges and actions, routed tabs as an underlined strip, and ' +
            'the content with an optional column beside it.',
          whenToUse:
            'For every page inside the agent-platform shell. It renders the ' +
            'page-header-actions slot, so actions registered by routed content ' +
            'appear in its header; the route above it mounts the provider.',
          migration: 'mixed',
        }),
      },
    },
  },
} satisfies Meta<typeof ShellPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DetailPage: Story = {};

export const ListPage: Story = {
  args: {
    breadcrumbs: undefined,
    badges: undefined,
    meta: undefined,
    menu: undefined,
    tabs: undefined,
    aside: undefined,
    title: 'Sessions',
    description: 'Every conversation you’ve had with an agent.',
    actions: <Button variant="primary">New session</Button>,
  },
};
