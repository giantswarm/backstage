import { useEffect } from 'react';
import type {
  ColumnConfig,
  SortDescriptor,
  TableItem,
  TableProps,
} from '@backstage/ui';

/**
 * Keeps a bui table sorted by a column it shows: when the sorted column is
 * hidden (a resize turned the table compact, `usePhoneColumns`), the sort
 * goes to `fallback`, the table's default on a column the compact layout
 * keeps. Otherwise the rows stay ordered by a column no header shows, with no
 * sort indicator to say why.
 *
 * For a table whose sort `useTable` owns. ui-react's `useVisibleSort` is the
 * other model: it owns the sort itself, for columns a page hides by choice.
 */
export function useSortOnShownColumn<T extends TableItem>(
  sort: TableProps<T>['sort'],
  columns: readonly ColumnConfig<T>[],
  fallback: SortDescriptor,
) {
  const isHidden = (id: unknown) =>
    columns.some(column => column.id === id && column.isHidden);
  const sortedHidden = isHidden(sort?.descriptor?.column);
  const fallbackHidden = isHidden(fallback.column);
  const onSortChange = sort?.onSortChange;
  const { column, direction } = fallback;

  useEffect(() => {
    if (sortedHidden && !fallbackHidden) {
      onSortChange?.({ column, direction });
    }
  }, [sortedHidden, fallbackHidden, onSortChange, column, direction]);
}
