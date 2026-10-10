import { useMemo } from 'react';
import { Cell, CellText, Table, Text, useTable } from '@backstage/ui';
import type { ColumnConfig } from '@backstage/ui';
import {
  columnMax,
  DataBar,
  ShowMore,
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
import { useMeasureColor } from '../../../lib/measures';

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

  const columnConfig: ColumnConfig<LlmModelRow>[] = [
    {
      id: 'model',
      label: 'Model',
      isRowHeader: true,
      isSortable: true,
      cell: row => <CellText title={row.model} />,
    },
    {
      id: 'calls',
      label: 'Model calls',
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
      label: 'Cost',
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
      label: 'Avg tokens/call',
      isSortable: true,
      cell: row => (
        <Cell>
          <DataBar
            label={
              row.avgTokensPerCall === undefined
                ? '—'
                : formatTokens(Math.round(row.avgTokensPerCall))
            }
            value={row.avgTokensPerCall}
            max={max.avgTokensPerCall}
            color={colorFor('avgTokensPerCall')}
          />
        </Cell>
      ),
    },
  ];

  const { tableProps } = useTable<LlmModelRow>({
    mode: 'complete',
    data: rows,
    sortFn: (data, sort) => sortUsageRows(data, sort, 'model'),
    initialSort: { column: 'costUsd', direction: 'descending' },
    // Off for the reason AgentsTable documents: `useCompletePagination` does
    // not reset its offset when the data shrinks.
    paginationOptions: { type: 'none' },
  });

  return (
    <UsageCard title="By model" note={note} wide>
      {/* Sort-then-slice: `tableProps.data` is the *sorted* rows, and
          `ShowMore` hands the table its first page of them. Passing the raw
          `rows` instead would silently undo every column sort while the
          header's indicator still moved. */}
      {/* The table scrolls inside the card at phone width rather than pushing
          the page wide — the 375px requirement. */}
      <ShowMore
        items={tableProps.data ?? []}
        initial={BY_MODEL_ROWS}
        noun="model"
        revealAll
      >
        {visible => (
          <div style={{ overflowX: 'auto' }}>
            <Table<LlmModelRow>
              {...tableProps}
              data={visible}
              columnConfig={columnConfig}
              emptyState={
                <Text variant="body-medium" color="secondary">
                  {emptyMessage}
                </Text>
              }
            />
          </div>
        )}
      </ShowMore>
    </UsageCard>
  );
}
