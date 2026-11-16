import { useContainerDimensions } from '../useContainerDimensions';
import { usePhoneLayout } from '../../utils/breakpoints';

/**
 * Whether a wide component — a table of many columns — takes its phone
 * layout: at phone width (`usePhoneLayout`), or while the element the
 * returned ref is on is narrower than `minWidth`, which is the case beside
 * the side rail on a tablet or a narrow window. bui's `Table` is
 * `table-layout: fixed` and does not scroll, so too narrow a slot squeezes
 * every column to a sliver and clips the actions; the phone layout (fewer
 * columns, or stacked rows) reads at any width.
 *
 * Until the element is measured the answer is the phone layout's alone.
 *
 * ```tsx
 * const [containerRef, isCompact] = useCompactLayout(800);
 * const shown = usePhoneColumns(columns, ['name', 'free'], { compact: isCompact });
 * <div ref={containerRef}><Table columnConfig={shown} ... /></div>
 * ```
 */
export function useCompactLayout(
  minWidth: number,
): [(node: Element | null) => void, boolean] {
  const isPhone = usePhoneLayout();
  const [containerRef, { width }] = useContainerDimensions();
  return [containerRef, isPhone || (width > 0 && width < minWidth)];
}
