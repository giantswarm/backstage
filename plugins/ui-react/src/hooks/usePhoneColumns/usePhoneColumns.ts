import { useMemo } from 'react';
import type { ColumnConfig, TableItem } from '@backstage/ui';
import { usePhoneLayout } from '../../utils/breakpoints';

/**
 * The narrowest a sortable bui column may get before the table drops to its
 * phone columns: below it, the header's padding and sort indicator leave its
 * label a letter or two.
 */
export const MIN_COLUMN_WIDTH = 80;

export type PhoneColumnsOptions = {
  /**
   * The table's width, in px, where it sits in a slot narrower than the
   * viewport (beside the side rail, in a card): measure it with
   * `useContainerDimensions`. When its visible columns would get less than
   * {@link MIN_COLUMN_WIDTH} each, the table keeps the phone columns at any
   * viewport width. `0` or unset: the viewport alone decides.
   */
  width?: number;
};

/**
 * Whether a table with `columnCount` visible columns gets its phone columns:
 * at phone width, or where `width` (its slot's, measured; `0` while unknown)
 * would leave each column less than {@link MIN_COLUMN_WIDTH}. What
 * {@link usePhoneColumns} decides by, for a cell that folds a hidden
 * column's fact into the name.
 */
export function usePhoneTable(columnCount: number, width = 0): boolean {
  const isPhoneViewport = usePhoneLayout();
  return (
    isPhoneViewport ||
    (width > 0 && columnCount > 0 && width / columnCount < MIN_COLUMN_WIDTH)
  );
}

/**
 * A bui table's columns at phone width: the name and the one or two numbers a
 * person decides on, every other column hidden.
 *
 * bui's `Table` does not scroll at phone width — it is `table-layout: fixed`
 * with clipping cells, so seven columns in 343px each get a sliver and every
 * value is cut. For an analytic table (a name plus numbers) the fix is fewer
 * columns, not narrower ones. This sets bui's own `ColumnConfig.isHidden` on
 * every column not kept, and only in the phone layout (`usePhoneLayout`);
 * on a wider viewport the columns come back unchanged. With `options.width`,
 * also where the table's own slot is too narrow for its columns.
 *
 * Kept: the columns named in `keepIds`, in their declared order, and the row
 * header (`isRowHeader`) whatever `keepIds` says — a row without one is a row
 * without a name. A column the caller already hides stays hidden.
 *
 * What a hidden column showed must stay reachable: fold an identity fact into
 * the name cell's description (`usePhoneTable()` says when), or leave it to
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
  options: PhoneColumnsOptions = {},
): ColumnConfig<T>[] {
  const isPhone = usePhoneTable(
    columns.filter(column => !column.isHidden).length,
    options.width,
  );
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
