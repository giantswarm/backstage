import { useMemo } from 'react';
import { Cell, Table, Text, useTable } from '@backstage/ui';
import type { ColumnConfig } from '@backstage/ui';
import {
  columnMax,
  DataBar,
  INITIAL_ROWS,
  ShowMore,
  tableMinWidth,
  useCompactLayout,
  usePhoneColumns,
} from '@giantswarm/backstage-plugin-ui-react';
import type { LlmPersonRow } from '../../../lib/llmUsage';
import {
  formatMoney,
  formatPercent,
  formatTokens,
  USD,
  type Currency,
} from '../../../lib/formatNumbers';
import { sortUsageRows } from '../../AgentUsageSection/helpers';
import { UsageCard } from '../UsageCard';
import { NameCell } from '../NameCell';
import { USAGE_COLUMN_MIN_WIDTH } from '../columnWidths';
import { useVisibleSort } from '../../../hooks/useVisibleSort';
import { useMeasureColor } from '../../../lib/measures';

export type LlmByPersonTableProps = {
  rows: LlmPersonRow[];
  emptyMessage: string;
  note?: string;
  /** The installation's display currency; USD when it has none. */
  currency?: Currency;
};

/**
 * Spend and tokens by the person behind the calls, the gateway's `user`
 * label: the monthly view's chargeback rows beside the agents'
 * (giantswarm/backstage#2672). The label is the person only where the
 * runtime knew one, so calls it named nobody for are a row of their own and
 * the rows still add up to the tiles above.
 *
 * No model calls column: the duration histogram is the server's, and the
 * label is not asserted on it. Spend, tokens and the share of spend are what
 * a chargeback needs.
 */
export function LlmByPersonTable({
  rows,
  emptyMessage,
  note,
  currency = USD,
}: LlmByPersonTableProps) {
  const colorFor = useMeasureColor();

  const max = useMemo(
    () => ({
      tokens: columnMax(rows, row => row.tokens),
      cost: columnMax(rows, row => row.costUsd),
      ratio: columnMax(rows, row => row.sharePct),
    }),
    [rows],
  );

  const columnsFor = (compact: boolean): ColumnConfig<LlmPersonRow>[] => [
    {
      id: 'label',
      label: 'Person',
      isRowHeader: true,
      isSortable: true,
      minWidth: USAGE_COLUMN_MIN_WIDTH.name,
      cell: row => <NameCell title={row.label} compact={compact} />,
    },
    {
      id: 'tokens',
      label: 'Tokens',
      isSortable: true,
      minWidth: USAGE_COLUMN_MIN_WIDTH.tokens,
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
      isSortable: true,
      minWidth: USAGE_COLUMN_MIN_WIDTH.spend,
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
      id: 'sharePct',
      label: 'Share of spend',
      isSortable: true,
      minWidth: USAGE_COLUMN_MIN_WIDTH.share,
      cell: row => (
        <Cell>
          <DataBar
            label={formatPercent(row.sharePct)}
            value={row.sharePct}
            max={max.ratio}
            color={colorFor('ratio')}
          />
        </Cell>
      ),
    },
  ];
  // At phone width, and in a card too narrow for every column, the person
  // and what they cost, as the other tables.
  const [tableRef, isCompact] = useCompactLayout(
    tableMinWidth(columnsFor(false)),
  );
  const shownColumns = usePhoneColumns(
    columnsFor(isCompact),
    ['label', 'costUsd'],
    { compact: isCompact },
  );

  const { tableProps } = useTable<LlmPersonRow>({
    mode: 'complete',
    data: rows,
    // Required in practice, though the type marks it optional: without it the
    // header indicator moves and the rows do not.
    sortFn: (data, sort) => sortUsageRows(data, sort, 'label'),
    initialSort: { column: 'costUsd', direction: 'descending' },
    // Off for the reason AgentsTable documents: `useCompletePagination` does
    // not reset its offset when the data shrinks.
    paginationOptions: { type: 'none' },
  });
  // The default sort is on Spend, which the compact layout keeps.
  useVisibleSort(tableProps.sort, shownColumns, {
    column: 'costUsd',
    direction: 'descending',
  });

  return (
    <UsageCard title="By person" note={note} wide>
      <div ref={tableRef}>
        <ShowMore
          items={tableProps.data ?? []}
          initial={INITIAL_ROWS}
          noun="person"
        >
          {visible => (
            <Table<LlmPersonRow>
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
      </div>
    </UsageCard>
  );
}
