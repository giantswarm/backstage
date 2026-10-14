import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Route, Routes } from 'react-router-dom';
import { Badge, Button, ButtonIcon, Flex, Select, Text } from '@backstage/ui';
import MoreHorizIcon from '@material-ui/icons/MoreHoriz';
import BookmarkBorderIcon from '@material-ui/icons/BookmarkBorder';
import MoreVertIcon from '@material-ui/icons/MoreVert';
import { FactsColumn } from '../FactsColumn';
import {
  PageHeaderActionsProvider,
  useProvidePageHeaderActions,
} from '../PageHeaderActions';
import { StatusDot } from '../StatusDot';
import { usePhoneLayout } from '../../utils/breakpoints';
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

/**
 * A title too long for one line, with icon actions (the session page's pin
 * and menu): the title wraps, and the actions stay at the top right beside
 * its first line, on a phone too.
 */
export const LongTitle: Story = {
  args: {
    title:
      'Investigate why the ingress controller on the staging cluster keeps restarting after the last upgrade',
    breadcrumbs: [
      { label: 'Sessions', href: '#sessions' },
      { label: 'Session' },
    ],
    badges: <StatusDot tone="neutral" label="Idle" />,
    meta: 'Started 14 Oct 2026, 09:12',
    actions: undefined,
    menu: (
      <>
        <ButtonIcon
          variant="tertiary"
          icon={<BookmarkBorderIcon />}
          aria-label="Pin session"
        />
        <ButtonIcon
          variant="tertiary"
          icon={<MoreVertIcon />}
          aria-label="Session actions"
        />
      </>
    ),
    tabs: undefined,
    aside: undefined,
  },
};

/**
 * Model hosting's actions as the view registers them: the header slot gets
 * one non-wrapping group (agent-platform's `ModelHostingActions`) — the
 * secondary and primary buttons and the ⋯, collapsed to the primary and the
 * ⋯ at phone width.
 */
function HostingActions() {
  const isPhone = usePhoneLayout();
  const actions = useMemo(
    () => (
      <Flex align="center" gap="2">
        {!isPhone && (
          <Button variant="secondary">Import from Hugging Face</Button>
        )}
        <Button variant="primary">Serve model</Button>
        <ButtonIcon
          variant="tertiary"
          icon={<MoreVertIcon />}
          aria-label="Model hosting actions"
        />
      </Flex>
    ),
    [isPhone],
  );
  useProvidePageHeaderActions(actions);
  return <Text>The selected tab’s content.</Text>;
}

/**
 * The Environment select beside a view's buttons, composed as Model hosting
 * composes it: the select as the page's `actions`, the view's group through
 * the header slot. The buttons line up with the select's field, not its
 * label, 8px from it. On a phone the group wraps under the description, and
 * the buttons under the select.
 */
export const WithEnvironmentSelect: Story = {
  args: {
    breadcrumbs: [
      { label: 'Customize', href: '#customize' },
      { label: 'Models', href: '#models' },
      { label: 'Model hosting' },
    ],
    title: 'Model hosting',
    description: 'Run models on your own GPUs, so data stays in your clusters.',
    badges: undefined,
    meta: undefined,
    actions: (
      <div style={{ minWidth: 200 }}>
        <Select
          label="Environment"
          options={[
            { id: 'all', label: 'All installations' },
            { id: 'gazelle', label: 'gazelle' },
          ]}
          defaultSelectedKey="all"
        />
      </div>
    ),
    menu: undefined,
    tabs: [
      { id: 'serving', path: '', title: 'Running models' },
      { id: 'capacity', path: 'capacity', title: 'GPU pools' },
    ],
    aside: undefined,
    children: <HostingActions />,
  },
};

/**
 * A resource page with an identity mark before its name (an agent's avatar,
 * a connector's tile) and two header buttons: the name keeps its own room
 * beside the buttons, the mark comes on top of it, and mark and buttons both
 * sit beside the name's first line.
 */
export const WithLeading: Story = {
  args: {
    title: 'Kubernetes troubleshooting assistant for the platform team',
    breadcrumbs: [
      { label: 'Customize', href: '#customize' },
      { label: 'Agents', href: '#agents' },
      { label: 'Kubernetes troubleshooting assistant' },
    ],
    leading: (
      <span
        aria-hidden
        style={{
          display: 'grid',
          placeItems: 'center',
          width: 56,
          height: 56,
          borderRadius: 14,
          background: 'var(--bui-bg-neutral-2)',
          fontSize: 22,
          fontWeight: 600,
        }}
      >
        K
      </span>
    ),
    badges: <StatusDot tone="success" label="Ready" />,
    meta: 'Created 2 Oct 2026',
    actions: (
      <>
        <Button variant="secondary">Edit</Button>
        <Button variant="primary">Use this agent</Button>
      </>
    ),
    menu: (
      <ButtonIcon
        variant="tertiary"
        icon={<MoreVertIcon />}
        aria-label="Agent actions"
      />
    ),
    aside: undefined,
  },
};
