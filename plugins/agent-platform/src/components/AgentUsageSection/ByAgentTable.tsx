import { makeStyles, Paper, Theme } from '@material-ui/core';
import { Cell, CellText, Table, Text, useTable } from '@backstage/ui';
import type { ColumnConfig } from '@backstage/ui';
import { formatCount, formatTokens } from '../../lib/formatNumbers';
import { sortUsageRows } from './helpers';
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
  emptyMessage: string;
};

/** Usage split by the agent that ran it. */
export function ByAgentTable({ rows, emptyMessage }: ByAgentTableProps) {
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
    // Required in practice, though the type marks it optional: without it the
    // header indicator moves and the rows do not.
    sortFn: (data, sort) => sortUsageRows(data, sort, 'agentName'),
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
      {/* No `data` prop here: `tableProps` already carries the *sorted* rows,
          and passing `data` after the spread overrides them with the unsorted
          input — which silently breaks every column header while leaving the
          sort indicator working. The section above renders a spinner while
          loading, so this table only ever mounts with data. */}
      <Table<ByAgentRow>
        {...tableProps}
        columnConfig={columnConfig}
        emptyState={
          <Text variant="body-medium" color="secondary">
            {emptyMessage}
          </Text>
        }
      />
    </Paper>
  );
}
