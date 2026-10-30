import { useMemo } from 'react';
import { Cell, Table, Text, useTable } from '@backstage/ui';
import type { ColumnConfig } from '@backstage/ui';
import {
  columnMax,
  DataBar,
  INITIAL_ROWS,
  ShowMore,
  usePhoneColumns,
} from '@giantswarm/backstage-plugin-ui-react';
import type { LlmOrganizationRow } from '../../../lib/llmUsage';
import {
  formatCount,
  formatMoney,
  formatPercent,
  formatTokens,
  USD,
  type Currency,
} from '../../../lib/formatNumbers';
import { sortUsageRows } from '../../AgentUsageSection/helpers';
import { UsageCard } from '../UsageCard';
import { NameCell } from '../NameCell';
import { useMeasureColor } from '../../../lib/measures';

export type LlmByOrganizationTableProps = {
  rows: LlmOrganizationRow[];
  emptyMessage: string;
  note?: string;
  /** The installation's display currency; USD when it has none. */
  currency?: Currency;
  /**
   * Where a row's name links to: the same view narrowed to that organization.
   * `undefined` for a row that is no scope (unattributed traffic).
   */
  hrefFor?: (row: LlmOrganizationRow) => string | undefined;
};

/**
 * Spend and volume by the organization whose agents made the calls: the cost
 * centre of the agent-permissions plan (giantswarm/giantswarm#36698, D8).
 *
 * A row covers every agent of one namespace, across every user, so the table
 * answers "which organization spent what" where the by-agent table answers
 * "which agent". Both reduce the same vectors, so their totals agree.
 *
 * The platform's shared agents are a row of their own, under `None` with a
 * line saying what it is, and traffic the gateway attributed to no caller is
 * one too, so the rows still add up to the tiles above them.
 *
 * Every numeric column carries a `DataBar` scaled to that column's own
 * maximum, for comparing rows down a column; the hues say the bars mean
 * nothing across columns.
 */
export function LlmByOrganizationTable({
  rows,
  emptyMessage,
  note,
  currency = USD,
  hrefFor,
}: LlmByOrganizationTableProps) {
  const colorFor = useMeasureColor();

  const max = useMemo(
    () => ({
      agents: columnMax(rows, row => row.agents),
      calls: columnMax(rows, row => row.calls),
      tokens: columnMax(rows, row => row.tokens),
      cost: columnMax(rows, row => row.costUsd),
      ratio: columnMax(rows, row => row.sharePct),
    }),
    [rows],
  );

  const columnConfig: ColumnConfig<LlmOrganizationRow>[] = [
    {
      id: 'label',
      label: 'Organization',
      isRowHeader: true,
      isSortable: true,
      cell: row => (
        <NameCell
          title={row.label}
          description={row.description}
          href={hrefFor?.(row)}
        />
      ),
    },
    {
      id: 'agents',
      label: 'Agents',
      isSortable: true,
      cell: row => (
        <Cell>
          <DataBar
            label={formatCount(row.agents)}
            value={row.agents}
            max={max.agents}
            color={colorFor('calls')}
          />
        </Cell>
      ),
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
      label: 'Spend',
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
      id: 'sharePct',
      label: 'Share of spend',
      isSortable: true,
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
  // At phone width the organization and what it cost, as the by-agent table.
  const shownColumns = usePhoneColumns(columnConfig, ['label', 'costUsd']);

  const { tableProps } = useTable<LlmOrganizationRow>({
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

  return (
    <UsageCard title="By organization" note={note} wide>
      {/* Sort-then-slice, as the by-agent table: `tableProps.data` is the
          sorted rows, and `ShowMore` hands the table its first page of them. */}
      <ShowMore
        items={tableProps.data ?? []}
        initial={INITIAL_ROWS}
        noun="organization"
      >
        {visible => (
          <Table<LlmOrganizationRow>
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
    </UsageCard>
  );
}
