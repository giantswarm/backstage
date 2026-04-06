import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Returns a ref and a paddingTop value that dynamically aligns the ref'd
 * element with the first element on the page matching the given selector.
 *
 * Pass `enabled: false` to disable the alignment (e.g. in a drawer).
 */
export function useAlignWithAnchor(selector: string, enabled = true) {
  const ref = useRef<HTMLDivElement>(null);
  const [paddingTop, setPaddingTop] = useState<number | undefined>();

  const recalculate = useCallback(() => {
    const root = ref.current;
    if (!root) return;
    const anchor = document.querySelector(selector);
    if (!anchor) return;
    const delta =
      anchor.getBoundingClientRect().top - root.getBoundingClientRect().top;
    setPaddingTop(Math.max(0, delta));
  }, [selector]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const root = ref.current;
    if (!root) return undefined;

    const anchor = document.querySelector(selector);

    // Observe resize of root and anchor to recalculate on layout changes
    const resizeObserver = new ResizeObserver(() => recalculate());
    resizeObserver.observe(root);
    if (anchor) {
      resizeObserver.observe(anchor);
    }

    // If the anchor isn't rendered yet, watch for it to appear
    let mutationObserver: MutationObserver | undefined;
    if (!anchor) {
      mutationObserver = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          resizeObserver.observe(found);
          recalculate();
          mutationObserver?.disconnect();
        }
      });
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    recalculate();

    return () => {
      resizeObserver.disconnect();
      mutationObserver?.disconnect();
    };
  }, [selector, enabled, recalculate]);

  return { ref, paddingTop };
}
