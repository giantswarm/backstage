import type { Meta, StoryObj } from '@storybook/react';
import { CellText, Table } from '@backstage/ui';
import { ExternalCellText } from './ExternalCellText';
import { componentDocs } from '../../storybook/docs';

type RepositoryRow = {
  id: string;
  repository: string;
  url?: string;
  note?: string;
  branch: string;
};

const rows: RepositoryRow[] = [
  {
    id: 'api',
    repository: 'example-org/api',
    url: 'https://github.com/example-org/api',
    branch: 'main',
  },
  {
    id: 'long',
    repository: 'example-org/a-repository-with-a-very-long-name-that-truncates',
    url: 'https://github.com/example-org/a-repository-with-a-very-long-name-that-truncates',
    note: 'left the selection, kept while a session uses it',
    branch: 'main',
  },
  { id: 'unlinked', repository: 'example-org/no-host', branch: 'main' },
];

const RepositoriesTable = () => (
  <div style={{ maxWidth: 520 }}>
    <Table
      columnConfig={[
        {
          id: 'repository',
          label: 'Repository',
          isRowHeader: true,
          defaultWidth: '3fr',
          cell: row => (
            <ExternalCellText
              title={row.repository}
              href={row.url}
              description={row.note}
            />
          ),
        },
        {
          id: 'branch',
          label: 'Default branch',
          defaultWidth: '1fr',
          cell: row => <CellText title={row.branch} />,
        },
      ]}
      data={rows}
      pagination={{ type: 'none' }}
    />
  </div>
);

const meta = {
  title: 'Components/ExternalCellText',
  component: ExternalCellText,
  tags: ['autodocs'],
  args: {
    title: 'example-org/api',
    href: 'https://github.com/example-org/api',
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'bui’s `CellText` for a link leaving the app: it opens in a new ' +
            'tab with the launch icon and “(opens in a new tab)” for screen ' +
            'readers, as `ExternalLink` does. The title truncates with the ' +
            'whole on hover; without an `href` it is plain `CellText`.',
          whenToUse:
            'In a bui `Table` cell whose link leads outside the app, such as a ' +
            'repository on GitHub. bui’s `CellText` takes an `href` but no ' +
            '`target`. For a link outside a table, use `ExternalLink`.',
          migration: 'mixed',
        }),
      },
    },
  },
  render: () => <RepositoriesTable />,
} satisfies Meta<typeof ExternalCellText>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InATable: Story = {};
