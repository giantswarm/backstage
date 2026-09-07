import { makeStyles, Paper, Theme } from '@material-ui/core';
import { Cell, CellText, Table, useTable } from '@backstage/ui';
import type { ColumnConfig } from '@backstage/ui';
import { formatCount, formatTokens } from '../../lib/formatNumbers';
import type { ByAgentRow } from './helpers';

const useStyles = makeStyles((theme: Theme) => ({
  card: {
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius * 2,
  },
  title: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(1),
  },
  number: {
    fontVariantNumeric: 'tabular-nums',
  },
}));

export type ByAgentTableProps = {
  rows: ByAgentRow[];
  isLoading?: boolean;
  emptyMessage: string;
};

/** Usage split by the agent that ran it. */
export function ByAgentTable({
  rows,
  isLoading,
  emptyMessage,
}: ByAgentTableProps) {
  const classes = useStyles();

  const number = (value: number, compact = false) => (
    <Cell>
      <span className={classes.number}>
        {compact ? formatTokens(value) : formatCount(value)}
      </span>
    </Cell>
  );

  const columnConfig: ColumnConfig<ByAgentRow>[] = [
    {
      id: 'agentName',
      label: 'Agent',
      isRowHeader: true,
      isSortable: true,
      cell: row => <CellText title={row.agentName} href={row.href} />,
    },
    {
      id: 'sessions',
      label: 'Sessions',
      isSortable: true,
      cell: row => number(row.sessions),
    },
    {
      id: 'turns',
      label: 'Turns',
      isSortable: true,
      cell: row => number(row.turns),
    },
    {
      id: 'inputTokens',
      label: 'Input tokens',
      isSortable: true,
      cell: row => number(row.inputTokens, true),
    },
    {
      id: 'outputTokens',
      label: 'Output tokens',
      isSortable: true,
      cell: row => number(row.outputTokens, true),
    },
  ];

  const { tableProps } = useTable<ByAgentRow>({
    mode: 'complete',
    data: rows,
    // The backend already ranks by spend; this keeps that as the default view
    // while letting a reader re-sort.
    initialSort: { column: 'inputTokens', direction: 'descending' },
    // Off for the reason AgentsTable documents: `useCompletePagination` does
    // not reset its offset when the data shrinks.
    paginationOptions: { type: 'none' },
  });

  return (
    <Paper variant="outlined" className={classes.card}>
      <div className={classes.title}>By agent</div>
      <Table<ByAgentRow>
        {...tableProps}
        data={isLoading ? undefined : rows}
        columnConfig={columnConfig}
        emptyState={<CellText title={emptyMessage} />}
      />
    </Paper>
  );
}
