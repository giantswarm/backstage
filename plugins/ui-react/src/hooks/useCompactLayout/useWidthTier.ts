import { useCallback, useLayoutEffect, useState } from 'react';
import { usePhoneLayout } from '../../utils/breakpoints';
import { COMPACT_LAYOUT_HYSTERESIS } from './useCompactLayout';

/**
 * Which of several layouts a wide component takes, from one measurement of
 * the element the returned ref is on, where `useCompactLayout` answers for
 * two. `minWidths` are the widths the layouts need, widest first, and the
 * answer is how many of them the element is narrower than: 0 for the first
 * layout, `minWidths.length` for the narrowest (the compact one), which
 * phone width always takes. A step down
 * happens below its minimum, the step back up only from
 * {@link COMPACT_LAYOUT_HYSTERESIS} above it.
 *
 * Put the ref on an element whose width comes from its parent, not from what
 * it holds. It is measured before the first paint and then observed; only a
 * change of the answer re-renders. A width of 0 (an element not laid out, or
 * jsdom without a mocked width) gives 0.
 *
 * ```tsx
 * // Every column, then without Environment, then stacked rows.
 * const [ref, tier] = useWidthTier([fullWidth, withoutEnvironmentWidth]);
 * ```
 */
export function useWidthTier(
  minWidths: readonly number[],
): [(node: Element | null) => void, number] {
  const isPhone = usePhoneLayout();
  const [node, setNode] = useState<Element | null>(null);
  const [tier, setTier] = useState(0);
  const ref = useCallback((element: Element | null) => {
    setNode(element);
  }, []);
  // A literal array is a new one every render; its contents are the key.
  const key = minWidths.join(',');

  useLayoutEffect(() => {
    if (!node) {
      return undefined;
    }
    const limits = key ? key.split(',').map(Number) : [];
    const update = (width: number) =>
      setTier(current => {
        if (width <= 0) {
          return 0;
        }
        let next = 0;
        for (const [index, limit] of limits.entries()) {
          const margin = current > index ? COMPACT_LAYOUT_HYSTERESIS : 0;
          if (width >= limit + margin) {
            break;
          }
          next = index + 1;
        }
        return next;
      });
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
  }, [node, key]);

  return [ref, isPhone ? minWidths.length : tier];
}
