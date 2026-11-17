import { useCallback, useMemo } from 'react';
import { Cell, Table, Text, useTable } from '@backstage/ui';
import type { ColumnConfig } from '@backstage/ui';
import {
  columnMax,
  DataBar,
  ShowMore,
  tableRowId,
} from '@giantswarm/backstage-plugin-ui-react';
import type { LlmModelRow } from '../../../lib/llmUsage';
import {
  formatCount,
  formatMoney,
  formatTokens,
  isConvertedCurrency,
  USD,
  type Currency,
} from '../../../lib/formatNumbers';
import { sortUsageRows } from '../../AgentUsageSection/helpers';
import { UsageCard } from '../UsageCard';
import { NameCell } from '../NameCell';
import { USAGE_COLUMN_MIN_WIDTH } from '../columnWidths';
import { useMeasureColor } from '../../../lib/measures';
import { useUsageTableColumns } from '../../../hooks/useUsageTableColumns';

/**
 * How many models the table shows before *Show all N models*. The models in
 * use are realistically tens, so one click reveals the rest rather than
 * paging through them.
 */
export const BY_MODEL_ROWS = 15;

export type LlmByModelTableProps = {
  rows: LlmModelRow[];
  emptyMessage: string;
  note?: string;
  /** The installation's display currency; USD when it has none. */
  currency?: Currency;
};

/**
 * Spend and volume by the model that answered.
 *
 * **This is the model each call actually ran on**, read off
 * `gen_ai_response_model` at the gateway — not the model an agent's
 * `ModelConfig` points at today. The session-derived table this replaced could
 * only do the latter, and so mis-attributed an agent's whole history whenever
 * its model changed mid-window.
 *
 * `$/1M` is a *blend*, not a list price: cache reads and writes count as
 * tokens here, so heavy caching pushes it below any model's headline rate.
 * `Avg tokens per call` is the context-creep figure — it climbing is the usual
 * reason a bill climbs without more traffic.
 *
 * Every numeric column carries a `DataBar` scaled to that column's own
 * maximum, each on its own hue, keyed by measure so "Tokens" is the same
 * colour here as in the By agent table. The bars compare rows **down** a
 * column and mean nothing across columns.
 *
 * The table sorts first and `ShowMore` slices the sorted rows, so the first
 * {@link BY_MODEL_ROWS} are always the top of whatever column is sorted, and
 * three models render with no reveal control at all.
 */
export function LlmByModelTable({
  rows,
  emptyMessage,
  note,
  currency = USD,
}: LlmByModelTableProps) {
  const colorFor = useMeasureColor();

  // One maximum per column, so a bar is read against the column it sits in.
  const max = useMemo(
    () => ({
      calls: columnMax(rows, row => row.calls),
      tokens: columnMax(rows, row => row.tokens),
      cost: columnMax(rows, row => row.costUsd),
      ratio: columnMax(rows, row => row.usdPerMillion),
      avgTokensPerCall: columnMax(rows, row => row.avgTokensPerCall),
    }),
    [rows],
  );

  // The columns, for the compact layout or the full one: compact, the model
  // id wraps to two lines.
  const columnsFor = useCallback(
    (compact: boolean): ColumnConfig<LlmModelRow>[] => [
      {
        id: 'model',
        label: 'Model',
        minWidth: USAGE_COLUMN_MIN_WIDTH.name,
        isRowHeader: true,
        isSortable: true,
        // Two lines at phone width: a model id cut to one line read as "a…".
        cell: row => <NameCell title={row.model} compact={compact} />,
      },
      {
        id: 'calls',
        label: 'Model calls',
        minWidth: USAGE_COLUMN_MIN_WIDTH.calls,
        isSortable: true,
        cell: row => (
          <Cell>
            <DataBar
              label={formatCount(row.calls)}
              value={row.calls}
              max={max.calls}
              color={colorFor('calls')}
            />
          </Cell>
        ),
      },
      {
        id: 'tokens',
        label: 'Tokens',
        minWidth: USAGE_COLUMN_MIN_WIDTH.tokens,
        isSortable: true,
        cell: row => (
          <Cell>
            <DataBar
              label={formatTokens(row.tokens)}
              value={row.tokens}
              max={max.tokens}
              color={colorFor('tokens')}
            />
          </Cell>
        ),
      },
      {
        id: 'costUsd',
        label: 'Spend',
        minWidth: USAGE_COLUMN_MIN_WIDTH.spend,
        isSortable: true,
        cell: row => (
          <Cell>
            <DataBar
              label={formatMoney(row.costUsd, currency)}
              value={row.costUsd}
              max={max.cost}
              color={colorFor('cost')}
            />
          </Cell>
        ),
      },
      {
        id: 'usdPerMillion',
        label: isConvertedCurrency(currency) ? 'Cost/1M tokens' : '$/1M tokens',
        minWidth: isConvertedCurrency(currency)
          ? USAGE_COLUMN_MIN_WIDTH.convertedRate
          : USAGE_COLUMN_MIN_WIDTH.rate,
        isSortable: true,
        cell: row => (
          <Cell>
            <DataBar
              label={formatMoney(row.usdPerMillion, currency)}
              value={row.usdPerMillion}
              max={max.ratio}
              color={colorFor('ratio')}
            />
          </Cell>
        ),
      },
      {
        id: 'avgTokensPerCall',
        // The average is implied; "Avg tokens/call" did not fit a phone.
        label: 'Tokens/call',
        minWidth: USAGE_COLUMN_MIN_WIDTH.tokensPerCall,
        isSortable: true,
        cell: row => (
          <Cell>
            <DataBar
              label={
                row.avgTokensPerCall === undefined
                  ? '—'
                  : formatTokens(row.avgTokensPerCall)
              }
              value={row.avgTokensPerCall}
              max={max.avgTokensPerCall}
              color={colorFor('avgTokensPerCall')}
            />
          </Cell>
        ),
      },
    ],
    [max, colorFor, currency],
  );

  const { tableProps } = useTable<LlmModelRow>({
    mode: 'complete',
    data: rows,
    sortFn: (data, sort) => sortUsageRows(data, sort, 'model'),
    initialSort: { column: 'costUsd', direction: 'descending' },
    // Off for the reason AgentsTable documents: `useCompletePagination` does
    // not reset its offset when the data shrinks.
    paginationOptions: { type: 'none' },
  });
  // At phone width, and wherever the card is narrower than the columns'
  // minimums, the model, what it cost and its context creep (T22 B10): six
  // columns in 343px clipped every figure. The volume is in the tab's KPI
  // tiles and the cost-per-day chart; the blended rate is cost ÷ tokens.
  // It keeps Spend, the default sort.
  const { ref: tableRef, columns: shownColumns } = useUsageTableColumns(
    columnsFor,
    ['model', 'costUsd', 'avgTokensPerCall'],
    tableProps.sort,
  );

  return (
    <UsageCard title="By model" note={note} wide>
      {/* Sort-then-slice: `tableProps.data` is the *sorted* rows, and
          `ShowMore` hands the table its first page of them. Passing the raw
          `rows` instead would silently undo every column sort while the
          header's indicator still moved. */}
      <div ref={tableRef}>
        <ShowMore
          items={tableProps.data ?? []}
          initial={BY_MODEL_ROWS}
          noun="model"
          revealAll
        >
          {visible => (
            <Table<LlmModelRow>
              {...tableProps}
              data={visible.map(row => ({
                ...row,
                id: tableRowId('model', row.id),
              }))}
              columnConfig={shownColumns}
              emptyState={
                <Text variant="body-medium" color="secondary">
                  {emptyMessage}
                </Text>
              }
            />
          )}
        </ShowMore>
      </div>
    </UsageCard>
  );
}
