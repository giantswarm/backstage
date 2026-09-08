import { makeStyles, Paper, Theme } from '@material-ui/core';
import { Cell, Table, Text, useTable } from '@backstage/ui';
import type { ColumnConfig } from '@backstage/ui';
import { formatCount } from '../../lib/formatNumbers';

const useStyles = makeStyles((theme: Theme) => ({
  card: {
    flex: '1 1 380px',
    minWidth: 0,
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
  name: {
    fontFamily: 'monospace',
    fontSize: '0.8rem',
  },
  calls: {
    fontVariantNumeric: 'tabular-nums',
  },
}));

export type TopCallsRow = { id: string; name: string; calls: number };

export type TopCallsTableProps = {
  title: string;
  /** Heading of the name column — "Tool", or "MCP server". */
  nameLabel: string;
  rows: TopCallsRow[];
  emptyMessage: string;
};

/**
 * A "top N by call count" table. Used twice: tools, and the muster servers
 * behind them.
 */
export function TopCallsTable({
  title,
  nameLabel,
  rows,
  emptyMessage,
}: TopCallsTableProps) {
  const classes = useStyles();

  const columnConfig: ColumnConfig<TopCallsRow>[] = [
    {
      id: 'name',
      label: nameLabel,
      isRowHeader: true,
      cell: row => (
        <Cell>
          <span className={classes.name}>{row.name}</span>
        </Cell>
      ),
    },
    {
      id: 'calls',
      label: 'Calls',
      cell: row => (
        <Cell>
          <span className={classes.calls}>{formatCount(row.calls)}</span>
        </Cell>
      ),
    },
  ];

  const { tableProps } = useTable<TopCallsRow>({
    mode: 'complete',
    // Already ranked by the backend, deterministically, so no client sort.
    data: rows,
    paginationOptions: { type: 'none' },
  });

  return (
    <Paper variant="outlined" className={classes.card}>
      <div className={classes.title}>{title}</div>
      {/* No `data` prop: it would override the rows `tableProps` already
          carries. See the note in ByAgentTable. */}
      <Table<TopCallsRow>
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
