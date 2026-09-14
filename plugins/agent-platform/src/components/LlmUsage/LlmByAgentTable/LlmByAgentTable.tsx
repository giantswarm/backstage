import { useMemo } from 'react';
import { Cell, CellText, Table, Text, useTable } from '@backstage/ui';
import type { ColumnConfig } from '@backstage/ui';
import { columnMax, DataBar } from '@giantswarm/backstage-plugin-ui-react';
import type { LlmAgentRow } from '../../../lib/llmUsage';
import {
  formatCount,
  formatPercent,
  formatTokens,
  formatUsd,
} from '../../../lib/formatNumbers';
import { sortUsageRows } from '../../AgentUsageSection/helpers';
import { UsageCard } from '../UsageCard';
import { useMeasureColor } from '../../../lib/measures';

export type LlmByAgentTableProps = {
  rows: LlmAgentRow[];
  emptyMessage: string;
  note?: string;
};

/**
 * Spend and volume by the agent that made the calls, across every user.
 *
 * The agent is the gateway's attribution of the *calling pod*, so this covers
 * everyone's traffic through that agent — which is the only "all users" view
 * the metrics can give: they carry no user label.
 *
 * Every numeric column carries a `DataBar` scaled to that column's own
 * maximum, each on its own hue. The bars are for comparing rows **down** a
 * column; they say nothing across columns, which is what the separate hues
 * signal.
 */
export function LlmByAgentTable({
  rows,
  emptyMessage,
  note,
}: LlmByAgentTableProps) {
  const colorFor = useMeasureColor();

  // One maximum per column, so a bar is read against the column it sits in.
  const max = useMemo(
    () => ({
      calls: columnMax(rows, row => row.calls),
      tokens: columnMax(rows, row => row.tokens),
      cost: columnMax(rows, row => row.costUsd),
      ratio: columnMax(rows, row => row.sharePct),
    }),
    [rows],
  );

  const columnConfig: ColumnConfig<LlmAgentRow>[] = [
    {
      id: 'label',
      label: 'Agent',
      isRowHeader: true,
      isSortable: true,
      cell: row => <CellText title={row.label} href={row.href} />,
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
            label={formatUsd(row.costUsd)}
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

  const { tableProps } = useTable<LlmAgentRow>({
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
    <UsageCard title="By agent" note={note} wide>
      {/* No `data` prop here: `tableProps` already carries the *sorted* rows,
          and passing `data` after the spread overrides them with the unsorted
          input — which silently breaks every column header while leaving the
          sort indicator working. */}
      <Table<LlmAgentRow>
        {...tableProps}
        columnConfig={columnConfig}
        emptyState={
          <Text variant="body-medium" color="secondary">
            {emptyMessage}
          </Text>
        }
      />
    </UsageCard>
  );
}
