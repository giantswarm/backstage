import { Table, useTable } from '@backstage/ui';
import type { ColumnConfig } from '@backstage/ui';
import { usePhoneColumns } from '@giantswarm/backstage-plugin-ui-react';

import { McpUsageCard } from '../McpUsageCard';
import { PHONE_COLUMNS } from './columns';

export type McpUsageTableProps<T extends { id: string }> = {
  rows: T[];
  columns: ColumnConfig<T>[];
};

/**
 * One of the usage tables: a bui `Table` like the other usage tables on the
 * Usage page, in the order it is given (busiest first), unsorted and unpaged
 * — a long list is revealed by `ShowMore` around it. At phone width it keeps
 * the name and Calls (T22 C19); the columns put the rest under the name.
 */
export function McpUsageTable<T extends { id: string }>({
  rows,
  columns,
}: McpUsageTableProps<T>) {
  const shown = usePhoneColumns(columns, PHONE_COLUMNS);
  const { tableProps } = useTable<T>({
    mode: 'complete',
    data: rows,
    paginationOptions: { type: 'none' },
  });
  return (
    <McpUsageCard scrolls>
      <Table<T> {...tableProps} data={rows} columnConfig={shown} />
    </McpUsageCard>
  );
}
