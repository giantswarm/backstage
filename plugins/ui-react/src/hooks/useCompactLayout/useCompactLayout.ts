import { useCallback, useLayoutEffect, useState } from 'react';
import type { ColumnConfig, TableItem } from '@backstage/ui';
import { usePhoneLayout } from '../../utils/breakpoints';

/** The width, in px, a bui table column needs before its values squeeze. */
export const TABLE_COLUMN_MIN_WIDTH = 80;
/** The width, in px, the name column (`isRowHeader`) needs: a name with its badge or hint. */
export const TABLE_NAME_COLUMN_MIN_WIDTH = 160;

/**
 * How much wider than its minimum a compact container must get before it is
 * full again. The switch changes the content's height, which can bring a
 * classic scrollbar in or take it out; without the margin, that change of
 * width could flip the layout back and forth.
 */
export const COMPACT_LAYOUT_HYSTERESIS = 24;

/**
 * The narrowest a bui table shows all of `columns` at: the sum of the shown
 * columns' minimum widths. A column's minimum is the larger of its entry in
 * `minWidths` (an actions column with several buttons, say) and its own
 * numeric `minWidth`, else {@link TABLE_NAME_COLUMN_MIN_WIDTH} for the row
 * header and {@link TABLE_COLUMN_MIN_WIDTH} for the others. Hidden columns count
 * for nothing. Pass it to {@link useCompactLayout}.
 *
 * A `minWidth` on a column engages bui's resizable container, which shares
 * the width out by `fr` but never gives a column less than its minimum: the
 * way to hold a header and a short value whole (the `tables` skill, "Rule:
 * typical content fits"). The compact layout then takes over where the sum
 * no longer fits.
 */
export function tableMinWidth<T extends TableItem>(
  columns: readonly ColumnConfig<T>[],
  minWidths: Readonly<Record<string, number>> = {},
): number {
  return columns
    .filter(column => !column.isHidden)
    .reduce(
      (sum, column) => sum + columnMinWidth(column, minWidths[column.id]),
      0,
    );
}

/**
 * One column's minimum: the larger of its `minWidths` entry and its own
 * numeric `minWidth` (bui holds the column to the latter whatever the map
 * says), else the default for a name or another column.
 */
function columnMinWidth<T extends TableItem>(
  column: ColumnConfig<T>,
  entry: number | undefined,
): number {
  const own = typeof column.minWidth === 'number' ? column.minWidth : undefined;
  if (entry === undefined && own === undefined) {
    return column.isRowHeader
      ? TABLE_NAME_COLUMN_MIN_WIDTH
      : TABLE_COLUMN_MIN_WIDTH;
  }
  return Math.max(entry ?? 0, own ?? 0);
}

/**
 * Whether a wide component — a table of many columns — takes its phone
 * layout: at phone width (`usePhoneLayout`), or while the element the
 * returned ref is on is narrower than `minWidth` (for a table,
 * {@link tableMinWidth}), which is the case beside the side rail on a tablet
 * or a narrow window. bui's `Table` is `table-layout: fixed` and does not
 * scroll, so too narrow a slot squeezes every column to a sliver and clips
 * the actions; the phone layout (fewer columns, or stacked rows) reads at any
 * width. Meant for every such table, not only the ones that use it today.
 *
 * Put the ref on an element whose width comes from its parent, not from what
 * it holds (a block wrapper around the table and its compact counterpart), so
 * the switch never changes what is measured. The element is measured before
 * the first paint, so the first frame already has the right layout, and then
 * observed; only a change of the answer re-renders. Once compact, it stays
 * so until the element is {@link COMPACT_LAYOUT_HYSTERESIS} wider than
 * `minWidth`.
 *
 * ```tsx
 * const [containerRef, isCompact] = useCompactLayout(tableMinWidth(columns));
 * const shown = usePhoneColumns(columns, ['name', 'free'], { compact: isCompact });
 * <div ref={containerRef}><Table columnConfig={shown} ... /></div>
 * ```
 */
export function useCompactLayout(
  minWidth: number,
): [(node: Element | null) => void, boolean] {
  const isPhone = usePhoneLayout();
  const [node, setNode] = useState<Element | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);
  const containerRef = useCallback((element: Element | null) => {
    setNode(element);
  }, []);

  useLayoutEffect(() => {
    if (!node) {
      return undefined;
    }
    // A width of 0 is an element not laid out (hidden, or jsdom): no answer.
    // Compact below `minWidth`, full again only from
    // `minWidth + COMPACT_LAYOUT_HYSTERESIS`.
    const update = (width: number) =>
      setIsNarrow(
        narrow =>
          width > 0 &&
          width < (narrow ? minWidth + COMPACT_LAYOUT_HYSTERESIS : minWidth),
      );
    update(node.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(entries => {
      const entry = entries[entries.length - 1];
      if (entry) {
        update(entry.contentRect.width);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, minWidth]);

  return [containerRef, isPhone || isNarrow];
}
