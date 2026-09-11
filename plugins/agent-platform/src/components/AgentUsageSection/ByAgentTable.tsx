import { useMemo } from 'react';
import { makeStyles, Paper, Theme } from '@material-ui/core';
import { Cell, CellText, Table, Text, useTable } from '@backstage/ui';
import type { ColumnConfig } from '@backstage/ui';
import { DataBar } from '@giantswarm/backstage-plugin-ui-react';
import { estimateCost, type TokenRates } from '../../lib/costEstimate';
import { formatCount, formatTokens, formatUsd } from '../../lib/formatNumbers';
import { columnMax, useMeasureColor } from '../../lib/measures';
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
  note: {
    marginTop: theme.spacing(1),
    fontSize: 11,
    color: theme.palette.text.secondary,
  },
}));

export type ByAgentTableProps = {
  rows: ByAgentRow[];
  emptyMessage: string;
  /** The installation's observed $/token, for the estimated cost column. */
  rates?: TokenRates;
  /** The window that rate was averaged over, named in the column's caveat. */
  rateWindow?: string;
  /** Named in the caveat, so the blend's scope is not left to inference. */
  installation?: string;
};

/**
 * Usage split by the agent that ran it.
 *
 * The cost column is an estimate, and the only one on this page whose inputs
 * come from two different systems: kagent's token counts priced at the
 * gateway's observed rate. The Cost tab has the gateway's own per-agent spend,
 * which is exact but covers every user — these two figures answer different
 * questions and will not match.
 *
 * **The rate here is the installation's blend across every model**, one rate
 * for the whole table, because the table is one query and its rows span
 * models. The session detail page does better — it prices one session at its
 * own model's rate, and shows nothing rather than borrowing another model's —
 * and the note below says so, because a reader comparing the two surfaces
 * deserves to know which is the sharper number.
 */
export function ByAgentTable({
  rows,
  emptyMessage,
  rates,
  rateWindow,
  installation,
}: ByAgentTableProps) {
  const classes = useStyles();
  const colorFor = useMeasureColor();

  // One maximum per column, and the cost column's is derived the same way its
  // cells are — from the row's tokens and the shared rate — so the longest bar
  // is the row that actually costs most.
  const max = useMemo(
    () => ({
      sessions: columnMax(rows, row => row.sessions),
      turns: columnMax(rows, row => row.turns),
      inputTokens: columnMax(rows, row => row.inputTokens),
      outputTokens: columnMax(rows, row => row.outputTokens),
      cost: columnMax(rows, row =>
        estimateCost(row.inputTokens, row.outputTokens, rates),
      ),
    }),
    [rows, rates],
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
      cell: row => (
        <Cell>
          <DataBar
            label={formatCount(row.sessions)}
            value={row.sessions}
            max={max.sessions}
            color={colorFor('sessions')}
          />
        </Cell>
      ),
    },
    {
      id: 'turns',
      label: 'Turns',
      isSortable: true,
      cell: row => (
        <Cell>
          <DataBar
            label={formatCount(row.turns)}
            value={row.turns}
            max={max.turns}
            color={colorFor('turns')}
          />
        </Cell>
      ),
    },
    {
      id: 'inputTokens',
      label: 'Input tokens',
      isSortable: true,
      cell: row => (
        <Cell>
          <DataBar
            label={formatTokens(row.inputTokens)}
            value={row.inputTokens}
            max={max.inputTokens}
            color={colorFor('tokens')}
          />
        </Cell>
      ),
    },
    {
      id: 'outputTokens',
      label: 'Output tokens',
      isSortable: true,
      cell: row => (
        <Cell>
          <DataBar
            label={formatTokens(row.outputTokens)}
            value={row.outputTokens}
            max={max.outputTokens}
            color={colorFor('outputTokens')}
          />
        </Cell>
      ),
    },
    {
      id: 'estCostUsd',
      label: 'Est. cost',
      // Not sortable: `sortUsageRows` compares the row's own numeric fields,
      // and this one is computed at render. Sorting it would need the estimate
      // materialised onto the row, which is work for a column nobody ranks by
      // — the table is already ordered by the input tokens that drive it.
      cell: row => {
        const estimate = estimateCost(row.inputTokens, row.outputTokens, rates);
        return (
          <Cell>
            <DataBar
              label={formatUsd(estimate)}
              value={estimate}
              max={max.cost}
              color={colorFor('cost')}
            />
          </Cell>
        );
      },
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
      <div className={classes.note}>
        Cost is estimated: your token counts priced at{' '}
        {rateWindow ? `the last ${rateWindow} of ` : ''}
        {installation ?? 'this installation'}&apos;s observed cost per token —{' '}
        <strong>a blend across every model</strong>, not each agent&apos;s own.
        The session detail page prices one session at its own model&apos;s rate
        instead, so the two will differ. Not a billed figure.
      </div>
    </Paper>
  );
}
