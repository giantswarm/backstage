import { useEffect, useState } from 'react';

/**
 * Whether `marker` has scrolled out of view above the top of the viewport.
 *
 * Read with an `IntersectionObserver` rather than a scroll handler: the
 * browser reports the crossing, nothing runs per scrolled pixel, and nothing
 * reads layout while scrolling. Below the viewport counts as not past, so a
 * marker still to come never reads as gone.
 *
 * Takes the element rather than a ref (the caller holds it through a callback
 * ref), so it observes exactly what is mounted. Without `IntersectionObserver`
 * (tests, very old browsers) it never reports past.
 */
export function useScrolledPast(marker: Element | null): boolean {
  const [isPast, setPast] = useState(false);
  useEffect(() => {
    if (!marker || typeof IntersectionObserver === 'undefined') {
      setPast(false);
      return undefined;
    }
    const observer = new IntersectionObserver(entries => {
      const entry = entries[entries.length - 1];
      if (!entry) {
        return;
      }
      const top = entry.rootBounds?.top ?? 0;
      setPast(!entry.isIntersecting && entry.boundingClientRect.top < top);
    });
    observer.observe(marker);
    return () => observer.disconnect();
  }, [marker]);
  return isPast;
}
