import { useCallback, useMemo } from 'react';
import { makeStyles, Paper, Theme } from '@material-ui/core';
import { Cell, Skeleton, Table, Text, useTable } from '@backstage/ui';
import type { ColumnConfig } from '@backstage/ui';
import {
  columnMax,
  DataBar,
  ShowMore,
  type FittingTier,
  useFittingColumns,
  StackedRowList,
  type StackedRowItem,
} from '@giantswarm/backstage-plugin-ui-react';
import { estimateCost, type TokenRates } from '../../lib/costEstimate';
import { AVERAGE_RATE_CAVEAT } from '../../lib/costBasis';
import {
  formatCount,
  formatMoney,
  formatTokens,
  formatUsd,
  USD,
  type Currency,
} from '../../lib/formatNumbers';
import { useMeasureColor } from '../../lib/measures';
import { useSortOnShownColumn } from '../../hooks/useSortOnShownColumn';
import { lastDaysNoun } from '../../lib/usageWindow';
import { NameCell } from '../LlmUsage/NameCell';
import { USAGE_COLUMN_MIN_WIDTH } from '../LlmUsage/columnWidths';
import { sortUsageRows } from './helpers';
import type { ByAgentRow } from './helpers';

const useStyles = makeStyles((theme: Theme) => ({
  card: {
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius * 2,
  },
  title: {
    // 11px: a short uppercase heading, which caps make read as large as 12px.
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(1),
  },
  note: {
    marginTop: theme.spacing(1),
    // 11px, the heading's size: a footnote, set apart from the figures.
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

/**
 * Each column's minimum width, px: its header with the sort arrow and the
 * cell's padding, and its usual value (the `tables` skill, "Rule: typical
 * content fits").
 */
const BY_AGENT_COLUMN_MIN_WIDTHS: Readonly<Record<string, number>> = {
  agentName: USAGE_COLUMN_MIN_WIDTH.name,
  sessions: 110,
  turns: 90,
  inputTokens: 130,
  outputTokens: 140,
  estCostUsd: USAGE_COLUMN_MIN_WIDTH.spend,
  costUsd: 140,
};

/**
 * The columns a card too narrow for every one leaves out first, both named
 * under the agent.
 */
const BY_AGENT_COLUMNS_DROPPED_FIRST: readonly string[] = ['turns', 'costUsd'];

export type ByAgentTableProps = {
  rows: ByAgentRow[];
  emptyMessage: string;
  /** The installation's observed $/token, for the estimated cost column. */
  rates?: TokenRates;
  /** The days that rate was averaged over, named in the column's caveat. */
  rateWindowDays?: number;
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
  /**
   * The gateway's price for the person's own calls, per agent (keyed by the
   * row id, kagent's encoded agent id), when it could be read. Present, the
   * column shows it instead of the estimate.
   */
  actualCost?: ReadonlyMap<string, number>;
  /** Whether there is an actual cost is not known yet. */
  isActualCostLoading?: boolean;
  /**
   * What the actual cost covers, with its caveats, from
   * `describeActualCostByAgent`; the note under the table when it shows.
   */
  actualCostNote?: string;
  /** Why there is no actual cost, leading the estimate's note when set. */
  fallbackReason?: string;
};

/**
 * Usage split by the agent that ran it.
 *
 * The cost column is the gateway's own price for the person's calls through
 * each agent when the backend can read it (`actualCost`) — every call the
 * agent made as them, sessions or not, so it need not match the tokens beside
 * it. Where it cannot, the column falls back to an estimate, the only figure
 * on this page whose inputs come from two different systems: kagent's token
 * counts priced at the gateway's observed rate. The Cost tab has the
 * gateway's per-agent spend for every user, a different question again.
 *
 * What follows is about that fallback.
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
  rateWindowDays,
  installation,
  isRateLoading,
  hasRate = true,
  currency = USD,
  actualCost,
  isActualCostLoading,
  actualCostNote,
  fallbackReason,
}: ByAgentTableProps) {
  const classes = useStyles();
  const colorFor = useMeasureColor();

  // The figure a cost cell shows: the gateway's for the row when it was read
  // (no entry means none of the person's calls through it was priced, which
  // is `—`, not $0), else the estimate from the row's tokens.
  const costOf = useMemo(
    () =>
      actualCost
        ? (row: ByAgentRow) => actualCost.get(row.id)
        : (row: ByAgentRow) =>
            estimateCost(row.inputTokens, row.outputTokens, rates),
    [actualCost, rates],
  );
  const isCostLoading = Boolean(
    !actualCost && (isActualCostLoading || isRateLoading),
  );
  // Settled on the estimate: the note then explains it, and why.
  const showsEstimate = !actualCost && !isActualCostLoading;

  // One maximum per column, and the cost column's is derived the same way its
  // cells are, so the longest bar is the row that actually costs most.
  const max = useMemo(
    () => ({
      sessions: columnMax(rows, row => row.sessions),
      turns: columnMax(rows, row => row.turns),
      inputTokens: columnMax(rows, row => row.inputTokens),
      outputTokens: columnMax(rows, row => row.outputTokens),
      cost: columnMax(rows, costOf),
      costUsd: columnMax(rows, row => row.costUsd),
    }),
    [rows, costOf],
  );
  const anyReported = rows.some(row => row.costUsd !== undefined);

  // The columns of each layout: narrow, the turns and the reported cost go
  // under the agent's name; compact, the name wraps to two lines and carries
  // the reported cost.
  const columnsFor = useCallback(
    (tier: FittingTier): ColumnConfig<ByAgentRow>[] => [
      {
        id: 'agentName',
        label: 'Agent',
        isRowHeader: true,
        isSortable: true,
        // Narrow and compact, the values of the columns left out are named
        // under the agent, so every figure stays on the row.
        cell: row => (
          <NameCell
            title={row.agentName}
            href={row.href}
            // Wrapped, not cut: the line names the hidden columns' values,
            // which no hover may be needed to read.
            compact={tier !== 'full'}
            description={describeAgent(row, tier, anyReported)}
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
        label: actualCost || isActualCostLoading ? 'Cost' : 'Est. cost',
        // Not sortable: `sortUsageRows` compares the row's own numeric fields,
        // and this one is looked up or computed at render. Sorting it would need
        // it materialised onto the row, which is work for a column nobody ranks
        // by — the table is already ordered by the input tokens.
        cell: row => {
          const cost = isCostLoading ? undefined : costOf(row);
          return (
            <Cell>
              {/* A skeleton in place of the figure while it is in flight, for
                the reason `TotalsStrip` documents: an em dash here is a
                finding, and "not yet" is not one. The bar stays empty either
                way — `value` is undefined until there is a figure. */}
              <DataBar
                label={
                  isCostLoading ? (
                    <Skeleton width={52} height={16} rounded />
                  ) : (
                    formatMoney(cost, currency)
                  )
                }
                value={cost}
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
              id: 'costUsd',
              label: 'Reported cost',
              isSortable: true,
              cell: (row: ByAgentRow) => (
                <Cell>
                  {row.costUsd === undefined ? (
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
                      label={formatUsd(row.costUsd)}
                      value={row.costUsd}
                      max={max.costUsd}
                      color={colorFor('cost')}
                    />
                  )}
                </Cell>
              ),
            } satisfies ColumnConfig<ByAgentRow>,
          ]
        : []),
    ],
    [
      actualCost,
      anyReported,
      colorFor,
      costOf,
      currency,
      isActualCostLoading,
      isCostLoading,
      max,
    ],
  );
  // Every column while their minimums fit the card; without Turns and
  // Reported cost below that, named under the agent; a stacked row per
  // agent below that and at phone width (T22 B11: six or seven columns in
  // 343px clipped every figure, and three left no room to name the rest).
  const fit = useFittingColumns(columnsFor, {
    minWidths: BY_AGENT_COLUMN_MIN_WIDTHS,
    dropFirst: BY_AGENT_COLUMNS_DROPPED_FIRST,
  });
  const costLabel = actualCost || isActualCostLoading ? 'Cost' : 'Est. cost';
  // Every figure of the row, each whole: the facts wrap as a whole.
  const stackedRowOf = (row: ByAgentRow): StackedRowItem => {
    const cost = isCostLoading ? undefined : costOf(row);
    return {
      id: row.id,
      title: row.agentName,
      ...(row.href ? { href: row.href } : {}),
      facts: [
        `${formatCount(row.sessions)} ${row.sessions === 1 ? 'session' : 'sessions'}`,
        `${formatCount(row.turns)} ${row.turns === 1 ? 'turn' : 'turns'}`,
        `${formatTokens(row.inputTokens)} input tokens`,
        `${formatTokens(row.outputTokens)} output tokens`,
      ],
      details: (
        <Text as="div" variant="body-small" color="secondary">
          {costLabel}{' '}
          {isCostLoading ? (
            <Skeleton width={52} height={16} rounded />
          ) : (
            formatMoney(cost, currency)
          )}
          {reportedCostOf(row, anyReported) &&
            ` · ${reportedCostOf(row, anyReported)}`}
        </Text>
      ),
    };
  };

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
  // Narrow, Turns and Reported cost are hidden: a sort on them goes to
  // sessions, the busiest first.
  useSortOnShownColumn(tableProps.sort, fit.columns, {
    column: 'sessions',
    direction: 'descending',
  });

  return (
    <Paper variant="outlined" className={classes.card}>
      <div className={classes.title}>By agent</div>
      {/* Sort-then-slice: `tableProps.data` is the *sorted* rows, and
          `ShowMore` hands the table its first page of them. Passing the raw
          `rows` instead would silently undo every column sort while the
          header's indicator still moved. The section above renders a spinner
          while loading, so this table only ever mounts with data. */}
      <div ref={fit.ref}>
        <ShowMore
          items={tableProps.data ?? []}
          initial={BY_AGENT_ROWS}
          noun="agent"
          revealAll
        >
          {visible => {
            if (!fit.isCompact) {
              return (
                <Table<ByAgentRow>
                  {...tableProps}
                  data={visible}
                  columnConfig={fit.columns}
                  emptyState={
                    <Text variant="body-medium" color="secondary">
                      {emptyMessage}
                    </Text>
                  }
                />
              );
            }
            return visible.length > 0 ? (
              <StackedRowList
                aria-label="By agent"
                rows={visible.map(stackedRowOf)}
              />
            ) : (
              <Text variant="body-medium" color="secondary">
                {emptyMessage}
              </Text>
            );
          }}
        </ShowMore>
      </div>
      {/* The note has to match what the column actually shows. It described a
          rate as applied even when every cell was an em dash — on an
          installation with no Mimir, or after a failed query, that is a claim
          about a measurement that never ran. */}
      <div className={classes.note}>
        {actualCost && actualCostNote}
        {showsEstimate && fallbackReason && <>{fallbackReason} </>}
        {showsEstimate && hasRate && (
          <>
            Cost is estimated: your token counts priced at{' '}
            {installation ?? 'this environment'}&apos;s average cost per token
            {rateWindowDays
              ? ` over ${lastDaysNoun(rateWindowDays)}`
              : ''} — <strong>a blend across every model</strong>, not each
            agent&apos;s own. {AVERAGE_RATE_CAVEAT} Session pages use each
            session&apos;s own model rate, so the figures differ. It is not a
            billed figure.
          </>
        )}
        {showsEstimate && !hasRate && (
          <>
            No cost estimate: {installation ?? 'this environment'}&apos;s
            gateway metrics yield no rate. Token counts are unaffected.
          </>
        )}
        {anyReported &&
          ' Reported cost comes from the agent’s runtime, in USD; not every runtime reports one.'}
      </div>
    </Paper>
  );
}

/**
 * The cost the agent's runtime reported, in words; where no runtime in the
 * window reports one, nothing, as the table then has no Reported cost column.
 */
function reportedCostOf(
  row: ByAgentRow,
  anyReported: boolean,
): string | undefined {
  if (row.costUsd !== undefined) {
    return `${formatUsd(row.costUsd)} reported by its runtime`;
  }
  return anyReported ? 'cost not reported by its runtime' : undefined;
}

/**
 * The line under an agent's name in the narrow table: the values of the
 * columns it leaves out, the turns and the reported cost, so the row keeps
 * every figure the full table shows.
 */
export function describeAgent(
  row: ByAgentRow,
  tier: FittingTier,
  anyReported: boolean,
): string | undefined {
  if (tier === 'full') {
    return undefined;
  }
  return [
    `${formatCount(row.turns)} ${row.turns === 1 ? 'turn' : 'turns'}`,
    reportedCostOf(row, anyReported),
  ]
    .filter(Boolean)
    .join(' · ');
}
