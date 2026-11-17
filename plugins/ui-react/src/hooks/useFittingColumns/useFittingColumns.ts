import { useMemo } from 'react';
import type { ColumnConfig, TableItem } from '@backstage/ui';
import { tableMinWidth, useWidthTier } from '../useCompactLayout';

export type FittingColumns<T extends TableItem> = {
  /** Put on a wrapper whose width comes from its parent, as for `useCompactLayout`. */
  ref: (node: Element | null) => void;
  /** The columns to show, each holding its minimum width. */
  columns: ColumnConfig<T>[];
  /** Too narrow for every column: the `dropFirst` columns are hidden. */
  isNarrow: boolean;
  /** Too narrow for the rest too, or at phone width: take the compact layout. */
  isCompact: boolean;
  /**
   * The ids of the columns hidden in the layout shown (`dropFirst` while
   * narrow), for ui-react's `useVisibleSort`, so the sort moves off them.
   */
  hiddenIds: readonly string[];
};

const NONE: readonly string[] = [];

/**
 * A bui table whose columns keep their headers and values whole (the
 * `tables` skill, "Rule: typical content fits"), in three steps as its
 * container narrows: every column; without the `dropFirst` columns
 * (`isNarrow`), whose values `columnsFor(true)` folds into other cells; then
 * the compact layout (`isCompact`, stacked rows or the phone columns), which
 * the caller renders. One measurement (`useWidthTier`) decides.
 *
 * Each column gets its entry in `minWidths` as bui's `minWidth`, so bui
 * shares the width out by `fr` but never gives a column less: the header
 * with its sort arrow and padding, and the usual value. `tableMinWidth`
 * reads them from the columns; a column with none counts 160px for the name
 * and 80px for the others.
 *
 * Pass `columnsFor` stable (`useCallback`) and `minWidths` and `dropFirst`
 * as module constants: the columns are built once per change of them.
 *
 * ```tsx
 * const fit = useFittingColumns(columnsFor, {
 *   minWidths: { status: 130, cost: 120 },
 *   dropFirst: ['cluster'],
 * });
 * <div ref={fit.ref}>
 *   {fit.isCompact ? <StackedRowList … /> : <Table columnConfig={fit.columns} … />}
 * </div>
 * ```
 */
export function useFittingColumns<T extends TableItem>(
  columnsFor: (isNarrow: boolean) => readonly ColumnConfig<T>[],
  {
    minWidths,
    dropFirst = NONE,
  }: {
    minWidths: Readonly<Record<string, number>>;
    dropFirst?: readonly string[];
  },
): FittingColumns<T> {
  const full = useMemo(
    () => sizeColumns(columnsFor(false), minWidths, NONE),
    [columnsFor, minWidths],
  );
  const narrow = useMemo(
    () => sizeColumns(columnsFor(true), minWidths, dropFirst),
    [columnsFor, minWidths, dropFirst],
  );
  const [ref, tier] = useWidthTier([
    tableMinWidth(full),
    tableMinWidth(narrow),
  ]);
  const isNarrow = tier >= 1;

  return {
    ref,
    columns: isNarrow ? narrow : full,
    isNarrow,
    isCompact: tier >= 2,
    hiddenIds: isNarrow ? dropFirst : NONE,
  };
}

/** The columns with their minimums, those in `drop` hidden. */
function sizeColumns<T extends TableItem>(
  columns: readonly ColumnConfig<T>[],
  minWidths: Readonly<Record<string, number>>,
  drop: readonly string[],
): ColumnConfig<T>[] {
  return columns.map(column => {
    const minWidth = minWidths[column.id];
    return {
      ...column,
      ...(minWidth !== undefined && { minWidth }),
      ...(drop.includes(column.id) && { isHidden: true }),
    };
  });
}
