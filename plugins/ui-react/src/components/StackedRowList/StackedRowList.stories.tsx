import type { Meta, StoryObj } from '@storybook/react';
import { Button, ButtonIcon } from '@backstage/ui';
import MoreHorizIcon from '@material-ui/icons/MoreHoriz';
import { StackedRowList } from './StackedRowList';
import { StatusDot } from '../StatusDot';
import { componentDocs } from '../../storybook/docs';

const more = (name: string) => (
  <ButtonIcon
    variant="tertiary"
    size="small"
    aria-label={`More actions for ${name}`}
    icon={<MoreHorizIcon fontSize="small" />}
  />
);

const meta = {
  title: 'Components/StackedRowList',
  component: StackedRowList,
  tags: ['autodocs'],
  args: {
    'aria-label': 'Sessions',
    rows: [
      {
        id: '1',
        title: 'Why is the ingress on gazelle returning 504s?',
        href: '/agent-platform/sessions/1',
        status: <StatusDot tone="success" label="Done" />,
        facts: ['incident-helper', 'gazelle', '3 min ago'],
        actions: more('Why is the ingress on gazelle returning 504s?'),
      },
      {
        id: '2',
        title:
          'rotate_cluster_certificates_for_all_workload_clusters_in_the_management_cluster',
        href: '/agent-platform/sessions/2',
        status: <StatusDot tone="warning" label="Needs input" />,
        facts: ['platform-ops', 'gazelle', 'yesterday'],
        actions: more('rotate certificates'),
      },
      {
        id: '3',
        title: 'Jira',
        href: '/customize/connectors/jira',
        facts: ['OAuth sign-in', '42 tools'],
        actions: (
          <Button variant="secondary" size="small">
            Sign in
          </Button>
        ),
      },
    ],
  },
  // A phone's content width: 375px less the shell page's 16px gutters.
  decorators: [
    Story => (
      <div style={{ maxWidth: 343 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A list a person scans to open or act on one item, as stacked ' +
            'rows: line 1 is the title (a link whose hit area is the whole ' +
            'row), its status and the row’s actions; line 2 is two to four ' +
            'secondary facts joined by " · ".',
          whenToUse:
            'At phone width, in place of a bui `Table` of items a person ' +
            'opens or acts on (sessions, connectors, served models). bui ' +
            'tables clip rather than scroll at 343px, so a five-column list ' +
            'leaves the title a sliver and cuts off the action buttons. Swap ' +
            'with `usePhoneLayout()`. For a name-plus-numbers table, hide ' +
            'columns with `usePhoneColumns` instead.',
          migration: 'mixed',
          extra:
            'Actions never disappear: what was the table’s actions column is ' +
            'the row’s trailing ⋯ menu or button, pressable apart from the ' +
            'row link. Destructive actions go in the ⋯ menu. What a table hid ' +
            'in `title=` belongs in `details`. For hundreds of rows, render ' +
            'the list inside `ShowMore`.',
        }),
      },
    },
  },
} satisfies Meta<typeof StackedRowList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithDetails: Story = {
  args: {
    'aria-label': 'Served models',
    rows: [
      {
        id: 'llama',
        title: 'llama3.1-8b-instruct',
        href: '/agent-platform/models/llama',
        status: <StatusDot tone="warning" label="Starting" />,
        facts: ['meta-llama/Llama-3.1-8B-Instruct', 'vLLM', '1 GPU'],
        details:
          'Waiting for a GPU node: the pool is scaling up (2 of 3 nodes ready).',
        actions: more('llama3.1-8b-instruct'),
      },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          'A readiness message a table kept in `title=` is inline under the ' +
          'facts, where a phone can read it.',
      },
    },
  },
};
