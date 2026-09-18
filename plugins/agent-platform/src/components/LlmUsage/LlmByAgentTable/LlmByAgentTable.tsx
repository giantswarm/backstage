import { useMemo } from 'react';
import {
  Badge,
  Cell,
  CellText,
  Flex,
  Table,
  Text,
  useTable,
} from '@backstage/ui';
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

/** The mark on a row whose agent the portal no longer knows. */
const REMOVED_MARK = 'Removed';
const REMOVED_TITLE =
  'This agent matches none the portal knows: it has been removed since, or runs outside this view. Its spend stays in the totals.';

/**
 * The agent column: a known agent's name, linked to its page; a removed
 * agent's technical name marked as removed, so it is not read as a system
 * component with spend; unattributed traffic by the caller's word for it.
 */
function AgentCell({ row }: { row: LlmAgentRow }) {
  if (row.kind !== 'removed') {
    return <CellText title={row.label} href={row.href} />;
  }
  return (
    <Cell>
      <Flex align="center" gap="2">
        <Text as="p" variant="body-medium" truncate title={row.label}>
          {row.label}
        </Text>
        <span title={REMOVED_TITLE}>
          <Badge size="small">{REMOVED_MARK}</Badge>
        </span>
      </Flex>
    </Cell>
  );
}

/**
 * Spend and volume by the agent that made the calls, across every user.
 *
 * The agent is the one the gateway attributed the call to, so a row covers
 * everyone's traffic through that agent.
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
      cell: row => <AgentCell row={row} />,
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
