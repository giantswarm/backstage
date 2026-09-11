import { useMemo } from 'react';
import { Cell, CellText, Table, Text, useTable } from '@backstage/ui';
import type { ColumnConfig } from '@backstage/ui';
import { DataBar } from '@giantswarm/backstage-plugin-ui-react';
import type { LlmModelRow } from '../../../lib/llmUsage';
import {
  formatCount,
  formatTokens,
  formatUsd,
} from '../../../lib/formatNumbers';
import { sortUsageRows } from '../../AgentUsageSection/helpers';
import { UsageCard } from '../UsageCard';
import { columnMax, useMeasureColor } from '../../../lib/measures';

export type LlmByModelTableProps = {
  rows: LlmModelRow[];
  emptyMessage: string;
  note?: string;
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
 */
export function LlmByModelTable({
  rows,
  emptyMessage,
  note,
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
            label={formatUsd(row.costUsd)}
            value={row.costUsd}
            max={max.cost}
            color={colorFor('cost')}
          />
        </Cell>
      ),
    },
    {
      id: 'usdPerMillion',
      label: '$/1M tokens',
      isSortable: true,
      cell: row => (
        <Cell>
          <DataBar
            label={formatUsd(row.usdPerMillion)}
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
    paginationOptions: { type: 'none' },
  });

  return (
    <UsageCard title="By model" note={note} wide>
      <Table<LlmModelRow>
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
