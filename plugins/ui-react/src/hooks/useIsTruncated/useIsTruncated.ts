import { useCallback, useEffect, useState } from 'react';

/**
 * Whether the element's own styling cuts its content off — a line clamp or an
 * ellipsis — so a "show more" affordance is worth rendering.
 *
 * Returns a ref callback to put on the element, and the answer. A callback ref
 * rather than a `useRef` object because the element is often rendered
 * conditionally: an effect keyed on a ref object captures `null` at mount and
 * never re-runs when the element finally appears.
 *
 * Re-measured whenever the element resizes: the same sentence fits in a wide
 * card and is clamped in a narrow one, and text that grows or shrinks resizes
 * the element too. Text that changes without changing the element's size — a
 * clamped paragraph swapped for a longer one, both cut at the same line — is the
 * one case this does not catch.
 */
export function useIsTruncated(): [
  (node: HTMLElement | null) => void,
  boolean,
] {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const ref = useCallback((element: HTMLElement | null) => {
    setNode(element);
  }, []);

  useEffect(() => {
    if (!node) {
      setIsTruncated(false);
      return undefined;
    }

    // A rounded line height can leave a sub-pixel difference on text that is
    // not actually cut off.
    const measure = () =>
      setIsTruncated(
        node.scrollHeight > node.clientHeight + 1 ||
          node.scrollWidth > node.clientWidth + 1,
      );

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [ref, isTruncated];
}
