import { makeStyles, Paper, Theme } from '@material-ui/core';
import { Cell, Table, Text, useTable } from '@backstage/ui';
import type { ColumnConfig } from '@backstage/ui';
import { formatCount, formatTokens } from '../../lib/formatNumbers';
import { sortUsageRows } from './helpers';
import type { ByModelRow } from './helpers';

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
  note: {
    marginTop: theme.spacing(1),
    display: 'block',
  },
  number: {
    fontVariantNumeric: 'tabular-nums',
  },
}));

export type ByModelTableProps = {
  rows: ByModelRow[];
  emptyMessage: string;
};

/**
 * Usage rolled up by the model behind each agent.
 *
 * Carries a caveat rather than implying a historical breakdown: the model is
 * the one each agent runs on *now*. kagent records no per-session model, so an
 * agent whose ModelConfig changed inside the window has its whole history
 * attributed to its current model.
 */
export function ByModelTable({ rows, emptyMessage }: ByModelTableProps) {
  const classes = useStyles();

  const number = (value: number, compact = false) => (
    <Cell>
      <span className={classes.number}>
        {compact ? formatTokens(value) : formatCount(value)}
      </span>
    </Cell>
  );

  const columnConfig: ColumnConfig<ByModelRow>[] = [
    {
      id: 'model',
      label: 'Model',
      isRowHeader: true,
      isSortable: true,
      cell: row => (
        <Cell>
          <span>{row.model}</span>
        </Cell>
      ),
    },
    {
      id: 'agents',
      label: 'Agents',
      isSortable: true,
      cell: row => number(row.agents),
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

  const { tableProps } = useTable<ByModelRow>({
    mode: 'complete',
    data: rows,
    sortFn: (data, sort) => sortUsageRows(data, sort, 'model'),
    initialSort: { column: 'inputTokens', direction: 'descending' },
    paginationOptions: { type: 'none' },
  });

  return (
    <Paper variant="outlined" className={classes.card}>
      <div className={classes.title}>By model</div>
      {/* No `data` prop: `tableProps` already carries the sorted rows. */}
      <Table<ByModelRow>
        {...tableProps}
        columnConfig={columnConfig}
        emptyState={
          <Text variant="body-medium" color="secondary">
            {emptyMessage}
          </Text>
        }
      />
      <Text variant="body-small" color="secondary" className={classes.note}>
        The model each agent runs on now. kagent records no model per session,
        so an agent whose model changed inside the window counts entirely
        towards its current one.
      </Text>
    </Paper>
  );
}
