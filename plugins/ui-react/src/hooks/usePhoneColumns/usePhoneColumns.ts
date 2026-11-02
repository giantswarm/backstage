import { useMemo } from 'react';
import type { ColumnConfig, TableItem } from '@backstage/ui';
import { usePhoneLayout } from '../../utils/breakpoints';

/**
 * A bui table's columns at phone width: the name and the one or two numbers a
 * person decides on, every other column hidden.
 *
 * bui's `Table` does not scroll at phone width — it is `table-layout: fixed`
 * with clipping cells, so seven columns in 343px each get a sliver and every
 * value is cut. For an analytic table (a name plus numbers) the fix is fewer
 * columns, not narrower ones. This sets bui's own `ColumnConfig.isHidden` on
 * every column not kept, and only in the phone layout (`usePhoneLayout`);
 * on a wider viewport the columns come back unchanged.
 *
 * Kept: the columns named in `keepIds`, in their declared order, and the row
 * header (`isRowHeader`) whatever `keepIds` says — a row without one is a row
 * without a name. A column the caller already hides stays hidden.
 *
 * What a hidden column showed must stay reachable: fold an identity fact into
 * the name cell's description (`usePhoneLayout()` says when), or leave it to
 * the item's own page. An actions column is never hidden — keep it, or, for a
 * list a person acts on row by row, use `StackedRowList` instead.
 *
 * ```tsx
 * const columns = usePhoneColumns(columnConfig, ['agent', 'cost']);
 * <Table columnConfig={columns} ... />
 * ```
 */
export function usePhoneColumns<T extends TableItem>(
  columns: readonly ColumnConfig<T>[],
  keepIds: readonly string[],
): ColumnConfig<T>[] {
  const isPhone = usePhoneLayout();
  // A literal array is a new one every render; its contents are the key.
  const keepKey = keepIds.join('\u0000');

  return useMemo(() => {
    if (!isPhone) {
      return [...columns];
    }
    const keep = new Set(keepKey.split('\u0000'));
    if (process.env.NODE_ENV !== 'production') {
      const unknown = [...keep].filter(
        id => id && !columns.some(column => column.id === id),
      );
      if (unknown.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `usePhoneColumns: no column with id ${unknown
            .map(id => `"${id}"`)
            .join(', ')} to keep at phone width`,
        );
      }
    }
    return columns.map(column =>
      keep.has(column.id) || column.isRowHeader
        ? column
        : { ...column, isHidden: true },
    );
  }, [columns, keepKey, isPhone]);
}
