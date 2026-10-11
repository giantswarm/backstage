import { useMemo } from 'react';
import { makeStyles, Paper, Theme } from '@material-ui/core';
import { Cell, Skeleton, Table, Text, useTable } from '@backstage/ui';
import type { ColumnConfig } from '@backstage/ui';
import {
  columnMax,
  DataBar,
  ShowMore,
  usePhoneColumns,
  usePhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react';
import { estimateCost, type TokenRates } from '../../lib/costEstimate';
import {
  formatCount,
  formatMoney,
  formatTokens,
  formatUsd,
  USD,
  type Currency,
} from '../../lib/formatNumbers';
import { useMeasureColor } from '../../lib/measures';
import { NameCell } from '../LlmUsage/NameCell';
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

/**
 * How many agents the table shows before *Show all N agents*. Below the
 * shared page size: this is one person's agents, realistically tens, so the
 * one click reveals the rest rather than paging through them.
 */
export const BY_AGENT_ROWS = 15;

export type ByAgentTableProps = {
  rows: ByAgentRow[];
  emptyMessage: string;
  /** The installation's observed $/token, for the estimated cost column. */
  rates?: TokenRates;
  /** The window that rate was averaged over, named in the column's caveat. */
  rateWindow?: string;
  /** Named in the caveat, so the blend's scope is not left to inference. */
  installation?: string;
  /** The rate's two Mimir queries are still in flight. */
  isRateLoading?: boolean;
  /**
   * Whether a rate was actually derived.
   *
   * `false` means every cost cell is an em dash, and the note must not then
   * describe a rate as having been applied.
   */
  hasRate?: boolean;
  /** The installation's display currency, for the estimate; USD when none. */
  currency?: Currency;
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
  isRateLoading,
  hasRate = true,
  currency = USD,
}: ByAgentTableProps) {
  const classes = useStyles();
  const colorFor = useMeasureColor();
  const isPhone = usePhoneLayout();

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
      reportedCostUsd: columnMax(rows, row => row.reportedCostUsd),
    }),
    [rows, rates],
  );
  const anyReported = rows.some(row => row.reportedCostUsd !== undefined);

  const columnConfig: ColumnConfig<ByAgentRow>[] = [
    {
      id: 'agentName',
      label: 'Agent',
      isRowHeader: true,
      isSortable: true,
      // At phone width the Reported cost column is hidden; a runtime's own
      // figure is named under the agent instead, so it stays on the row.
      cell: row => (
        <NameCell
          title={row.agentName}
          href={row.href}
          description={
            isPhone && row.reportedCostUsd !== undefined
              ? `${formatUsd(row.reportedCostUsd)} reported by its runtime`
              : undefined
          }
        />
      ),
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
            {/* A skeleton in place of the figure while the rate is in
                flight, for the reason `TotalsStrip` documents: an em dash here
                is a finding, and "not yet" is not one. The bar stays empty
                either way — `value` is undefined until there is a rate. */}
            <DataBar
              label={
                isRateLoading ? (
                  <Skeleton width={52} height={16} rounded />
                ) : (
                  formatMoney(estimate, currency)
                )
              }
              value={estimate}
              max={max.cost}
              color={colorFor('cost')}
            />
          </Cell>
        );
      },
    },
    // Only when some runtime reported one: a column of "Not reported" teaches
    // the reader to ignore it, while absence says the truth — no runtime in
    // this window prices its own work.
    ...(anyReported
      ? [
          {
            id: 'reportedCostUsd',
            label: 'Reported cost',
            isSortable: true,
            cell: (row: ByAgentRow) => (
              <Cell>
                {row.reportedCostUsd === undefined ? (
                  // Words, not an em dash: beside a priced estimate a dash
                  // reads as "zero-ish", and the fact is "this runtime does
                  // not report costs".
                  <Text
                    as="span"
                    variant="body-small"
                    color="secondary"
                    title="Only some runtimes report a cost — the claude harness does, ADK does not."
                  >
                    Not reported
                  </Text>
                ) : (
                  <DataBar
                    // USD on purpose: it is what the runtime said, not a
                    // figure we price or convert.
                    label={formatUsd(row.reportedCostUsd)}
                    value={row.reportedCostUsd}
                    max={max.reportedCostUsd}
                    color={colorFor('cost')}
                  />
                )}
              </Cell>
            ),
          } satisfies ColumnConfig<ByAgentRow>,
        ]
      : []),
  ];

  // At phone width the agent, its sessions and the estimate (T22 B11): six or
  // seven columns in 343px clipped every figure. Turns and tokens are in the
  // totals above and on the agent's own Usage tab, a link away.
  const shownColumns = usePhoneColumns(columnConfig, [
    'agentName',
    'sessions',
    'estCostUsd',
  ]);

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
      {/* Sort-then-slice: `tableProps.data` is the *sorted* rows, and
          `ShowMore` hands the table its first page of them. Passing the raw
          `rows` instead would silently undo every column sort while the
          header's indicator still moved. The section above renders a spinner
          while loading, so this table only ever mounts with data. */}
      <ShowMore
        items={tableProps.data ?? []}
        initial={BY_AGENT_ROWS}
        noun="agent"
        revealAll
      >
        {visible => (
          <Table<ByAgentRow>
            {...tableProps}
            data={visible}
            columnConfig={shownColumns}
            emptyState={
              <Text variant="body-medium" color="secondary">
                {emptyMessage}
              </Text>
            }
          />
        )}
      </ShowMore>
      {/* The note has to match what the column actually shows. It described a
          rate as applied even when every cell was an em dash — on an
          installation with no Mimir, or after a failed query, that is a claim
          about a measurement that never ran. */}
      <div className={classes.note}>
        {hasRate ? (
          <>
            Cost is estimated: your token counts priced at{' '}
            {rateWindow ? `the last ${rateWindow} of ` : ''}
            {installation ?? 'this environment'}&apos;s observed cost per token
            — <strong>a blend across every model</strong>, not each agent&apos;s
            own. Session pages use each session&apos;s own model rate, so the
            figures differ. It is not a billed figure.
            {anyReported &&
              ' Reported cost comes from the agent’s runtime, in USD; not every runtime reports one.'}
          </>
        ) : (
          <>
            No cost estimate: {installation ?? 'this environment'}&apos;s
            gateway metrics yield no rate. Token counts are unaffected.
          </>
        )}
      </div>
    </Paper>
  );
}
