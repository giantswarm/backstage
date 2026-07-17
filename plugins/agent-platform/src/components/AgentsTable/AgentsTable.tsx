import { Cell, CellText, ColumnConfig, Table, Text } from '@backstage/ui';
import { AgentRow } from '../AgentsDataProvider';

const columnConfig: ColumnConfig<AgentRow>[] = [
  {
    id: 'name',
    label: 'Agent',
    isRowHeader: true,
    cell: row => <CellText title={row.name} description={row.description} />,
  },
  {
    id: 'installation',
    label: 'Installation',
    cell: row => <CellText title={row.installation} />,
  },
  {
    id: 'namespace',
    label: 'Namespace',
    cell: row => <CellText title={row.namespace || '—'} />,
  },
  {
    id: 'model',
    label: 'Model',
    cell: row => <CellText title={row.model ?? '—'} />,
  },
  {
    id: 'skills',
    label: 'Skills',
    width: '10%',
    cell: row => (
      <Cell>
        <Text style={{ fontVariantNumeric: 'tabular-nums' }}>
          {row.skillCount}
        </Text>
      </Cell>
    ),
  },
];

export type AgentsTableProps = {
  rows: AgentRow[];
};

/**
 * Presentational table of agents. The page owns loading (it shows a progress
 * bar and hides the table until the first agents arrive) and the
 * unreachable-installations notice; this only renders the rows and the
 * "no agents" empty state.
 */
export function AgentsTable({ rows }: AgentsTableProps) {
  return (
    <Table<AgentRow>
      columnConfig={columnConfig}
      data={rows}
      pagination={{ type: 'none' }}
      emptyState={
        <Text variant="body-medium" color="secondary">
          No agents found.
        </Text>
      }
    />
  );
}
