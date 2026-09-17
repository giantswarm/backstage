import { RefObject, useEffect, useState } from 'react';

/**
 * Whether the element's own styling cuts its content off — a line clamp or an
 * ellipsis — so a "show more" affordance is worth rendering.
 *
 * Re-measured whenever the element resizes: the same sentence fits in a wide
 * card and is clamped in a narrow one. Lifting the clamp is itself a resize, so
 * the answer goes back to `true` on its own once the clamp is reapplied.
 */
export function useIsTruncated(ref: RefObject<HTMLElement | null>): boolean {
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return undefined;
    }

    // A rounded line height can leave a sub-pixel difference on text that is
    // not actually cut off.
    const measure = () =>
      setIsTruncated(
        element.scrollHeight > element.clientHeight + 1 ||
          element.scrollWidth > element.clientWidth + 1,
      );

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return isTruncated;
}
