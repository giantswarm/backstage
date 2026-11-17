import { useCallback, useMemo } from 'react';
import type { ColumnConfig, TableItem } from '@backstage/ui';
import { tableMinWidth, useCompactLayout } from '../useCompactLayout';

export type FittingColumns<T extends TableItem> = {
  /** Put on a wrapper whose width comes from its parent, as for `useCompactLayout`. */
  ref: (node: Element | null) => void;
  /** The columns to show, each holding its minimum width. */
  columns: ColumnConfig<T>[];
  /** Too narrow for every column: the `dropFirst` columns are hidden. */
  isNarrow: boolean;
  /** Too narrow for the rest too, or at phone width: take the compact layout. */
  isCompact: boolean;
};

/**
 * A bui table whose columns keep their headers and values whole (the
 * `tables` skill, "Rule: typical content fits"), in three steps as its
 * container narrows: every column; without the `dropFirst` columns
 * (`isNarrow`), whose values the caller folds into another cell; then the
 * compact layout (`isCompact`, stacked rows or the phone columns), which the
 * caller renders.
 *
 * Each column gets its entry in `minWidths` as its `minWidth`, so bui shares
 * the width out by `fr` but never gives a column less: the header with its
 * sort arrow and padding, and the usual value. A column with none keeps
 * `tableMinWidth`'s defaults, 160px for the name and 80px for the others.
 *
 * ```tsx
 * const fit = useFittingColumns(columns, {
 *   minWidths: { status: 130, cost: 120 },
 *   dropFirst: ['cluster'],
 * });
 * <div ref={fit.ref}>
 *   {fit.isCompact ? <StackedRowList … /> : <Table columnConfig={fit.columns} … />}
 * </div>
 * ```
 */
export function useFittingColumns<T extends TableItem>(
  columns: readonly ColumnConfig<T>[],
  {
    minWidths,
    dropFirst = [],
    narrowColumns,
  }: {
    minWidths: Readonly<Record<string, number>>;
    dropFirst?: readonly string[];
    /**
     * The columns' narrow form, when their cells take in what the dropped
     * columns showed (where a pool runs, under its name); `columns` without
     * it.
     */
    narrowColumns?: readonly ColumnConfig<T>[];
  },
): FittingColumns<T> {
  const dropKey = dropFirst.join('\u0000');
  const full = useMemo(
    () => sizeColumns(columns, minWidths, ''),
    [columns, minWidths],
  );
  const narrow = useMemo(
    () => sizeColumns(narrowColumns ?? columns, minWidths, dropKey),
    [narrowColumns, columns, minWidths, dropKey],
  );

  const [fullRef, isNarrow] = useCompactLayout(tableMinWidth(full, minWidths));
  const [narrowRef, isCompact] = useCompactLayout(
    tableMinWidth(narrow, minWidths),
  );
  const ref = useCallback(
    (node: Element | null) => {
      fullRef(node);
      narrowRef(node);
    },
    [fullRef, narrowRef],
  );

  return { ref, columns: isNarrow ? narrow : full, isNarrow, isCompact };
}

/** The columns with their minimums, those in `dropKey` hidden. */
function sizeColumns<T extends TableItem>(
  columns: readonly ColumnConfig<T>[],
  minWidths: Readonly<Record<string, number>>,
  dropKey: string,
): ColumnConfig<T>[] {
  const drop = new Set(dropKey ? dropKey.split('\u0000') : []);
  return columns.map(column => ({
    ...column,
    ...(minWidths[column.id] !== undefined && {
      minWidth: minWidths[column.id],
    }),
    ...(drop.has(column.id) && { isHidden: true }),
  }));
}
