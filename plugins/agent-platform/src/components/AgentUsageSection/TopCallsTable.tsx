import { useMemo } from 'react';
import { makeStyles, Paper, Theme } from '@material-ui/core';
import { Cell, Table, Text, useTable } from '@backstage/ui';
import type { ColumnConfig } from '@backstage/ui';
import type { UsageRemainder } from '@giantswarm/backstage-plugin-agent-platform-common';
import { columnMax, DataBar } from '@giantswarm/backstage-plugin-ui-react';
import { formatCount } from '../../lib/formatNumbers';
import { useMeasureColor } from '../../lib/measures';

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
    // The body font, not monospace: these are names to read, and the column
    // carries no alignment that a fixed pitch would serve. `anywhere` rather
    // than `break-all` so a long `x_…` name breaks only when it must.
    overflowWrap: 'anywhere',
  },
  remainder: {
    marginTop: theme.spacing(1),
  },
}));

export type TopCallsRow = { id: string; name: string; calls: number };

export type TopCallsTableProps = {
  title: string;
  /** Heading of the name column — "Tool", or "MCP server". */
  nameLabel: string;
  rows: TopCallsRow[];
  /**
   * What the backend's cap left out. Rendered as one line under the table
   * when anything was; nothing at all when the list is exhaustive.
   */
  other?: UsageRemainder;
  emptyMessage: string;
};

/**
 * The line under a capped list: "and 14 more, 230 calls between them." —
 * TopAgentsCard's wording, so the Usage page says it one way.
 */
export function remainderLine({ count, calls }: UsageRemainder): string {
  const callsText = `${formatCount(calls)} ${calls === 1 ? 'call' : 'calls'}`;
  return count === 1
    ? `and 1 more, ${callsText}.`
    : `and ${formatCount(count)} more, ${callsText} between them.`;
}

/**
 * A "top N by call count" table. Used twice: tools, and the muster servers
 * behind them.
 *
 * The call column carries a data bar, which earns its place here more than in
 * most tables: the rows are already ranked, so the bar's job is to show *how
 * steeply* — whether one tool dominates or the top ten are level — which the
 * numbers alone make you do arithmetic for.
 *
 * The backend caps both lists, so the table never grows past its top N; what
 * the cap left out is one line under it ({@link remainderLine}) rather than
 * dropped silently.
 */
export function TopCallsTable({
  title,
  nameLabel,
  rows,
  other,
  emptyMessage,
}: TopCallsTableProps) {
  const classes = useStyles();
  const colorFor = useMeasureColor();

  const maxCalls = useMemo(() => columnMax(rows, row => row.calls), [rows]);

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
          <DataBar
            label={formatCount(row.calls)}
            value={row.calls}
            max={maxCalls}
            color={colorFor('calls')}
          />
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
      {other && other.count > 0 && (
        <Text
          as="p"
          variant="body-small"
          color="secondary"
          className={classes.remainder}
        >
          {remainderLine(other)}
        </Text>
      )}
    </Paper>
  );
}
