import { useMemo } from 'react';
import type { ColumnConfig, TableItem } from '@backstage/ui';
import { tableMinWidth, useWidthTier } from '../useCompactLayout';

/**
 * The layout a fitting table is in: every column; without the `dropFirst`
 * columns; or the compact layout.
 */
export type FittingTier = 'full' | 'narrow' | 'compact';

export type FittingColumns<T extends TableItem> = {
  /** Put on a wrapper whose width comes from its parent, as for `useCompactLayout`. */
  ref: (node: Element | null) => void;
  /**
   * The columns of the layout shown, each holding its minimum width: while
   * compact, `columnsFor('compact')`, for a caller that keeps a table there
   * (with `usePhoneColumns`) rather than stacking the rows.
   */
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
 * container narrows: every column (`columnsFor('full')`); without the
 * `dropFirst` columns (`isNarrow`), whose values `columnsFor('narrow')` folds
 * into other cells; then the compact layout (`isCompact`, stacked rows or the
 * phone columns), which the caller renders, from `columnsFor('compact')`
 * when it keeps a table. One measurement (`useWidthTier`) decides.
 *
 * Each column gets its entry in `minWidths` as bui's `minWidth`, so bui
 * shares the width out by `fr` but never gives a column less: the header
 * with its sort arrow and padding, and the usual value. `tableMinWidth`
 * reads them from the columns; a column with none counts 160px for the name
 * and 80px for the others. The compact columns get the same minimums, each
 * overridden by its entry in `compactMinWidths` (a name that wraps there).
 *
 * Pass `columnsFor` stable (`useCallback`) and the options as module
 * constants: the columns are built once per change of them, the compact
 * ones only while compact.
 *
 * ```tsx
 * const columnsFor = useCallback((tier: FittingTier) => …, […]);
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
  columnsFor: (tier: FittingTier) => readonly ColumnConfig<T>[],
  {
    minWidths,
    dropFirst = NONE,
    compactMinWidths,
  }: {
    minWidths: Readonly<Record<string, number>>;
    dropFirst?: readonly string[];
    compactMinWidths?: Readonly<Record<string, number>>;
  },
): FittingColumns<T> {
  const full = useMemo(
    () => sizeColumns(columnsFor('full'), minWidths, NONE),
    [columnsFor, minWidths],
  );
  const narrow = useMemo(
    () => sizeColumns(columnsFor('narrow'), minWidths, dropFirst),
    [columnsFor, minWidths, dropFirst],
  );
  const [ref, tier] = useWidthTier([
    tableMinWidth(full),
    tableMinWidth(narrow),
  ]);
  const isNarrow = tier >= 1;
  const isCompact = tier >= 2;
  const compact = useMemo(
    () =>
      isCompact
        ? sizeColumns(
            columnsFor('compact'),
            { ...minWidths, ...compactMinWidths },
            NONE,
          )
        : undefined,
    [isCompact, columnsFor, minWidths, compactMinWidths],
  );

  let columns = full;
  if (compact) {
    columns = compact;
  } else if (isNarrow) {
    columns = narrow;
  }
  return {
    ref,
    columns,
    isNarrow,
    isCompact,
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
