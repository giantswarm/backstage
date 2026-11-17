import { useMemo } from 'react';
import type {
  ColumnConfig,
  SortDescriptor,
  TableItem,
  TableProps,
} from '@backstage/ui';
import {
  tableMinWidth,
  useCompactLayout,
  usePhoneColumns,
} from '@giantswarm/backstage-plugin-ui-react';
import { useSortOnShownColumn } from './useSortOnShownColumn';

/**
 * The name column's minimum in the compact layout: its header ("Model") with
 * the sort arrow; the name wraps to two lines there, so the kept figures get
 * the width. By model keeps three columns, which must fit the 309px a card
 * has at 375px.
 */
export const COMPACT_NAME_MIN_WIDTH = 88;

const SPEND_DESCENDING: SortDescriptor = {
  column: 'costUsd',
  direction: 'descending',
};

/**
 * The shown columns of an LLM usage table (a name plus figures), and the ref
 * for the element whose width decides them: every column while their
 * minimums fit, else the compact columns `keepIds` (at phone width, and in a
 * card too narrow, beside the side rail), whose name column wraps
 * (`columnsFor(true)`). A sort on a column the compact layout hides goes to
 * `fallback`, Spend descending by default.
 *
 * Pass `columnsFor` stable (`useCallback`): the columns are built once per
 * change of it, not on every render.
 */
export function useUsageTableColumns<T extends TableItem>(
  columnsFor: (compact: boolean) => ColumnConfig<T>[],
  keepIds: readonly string[],
  sort: TableProps<T>['sort'],
  fallback: SortDescriptor = SPEND_DESCENDING,
): { ref: (node: Element | null) => void; columns: ColumnConfig<T>[] } {
  const full = useMemo(() => columnsFor(false), [columnsFor]);
  const compact = useMemo(
    () =>
      columnsFor(true).map(column =>
        column.isRowHeader
          ? { ...column, minWidth: COMPACT_NAME_MIN_WIDTH }
          : column,
      ),
    [columnsFor],
  );
  const [ref, isCompact] = useCompactLayout(tableMinWidth(full));
  const columns = usePhoneColumns(isCompact ? compact : full, keepIds, {
    compact: isCompact,
  });
  useSortOnShownColumn(sort, columns, fallback);
  return { ref, columns };
}
