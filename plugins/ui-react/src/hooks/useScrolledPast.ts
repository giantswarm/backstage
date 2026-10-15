import { useEffect, useState } from 'react';

/**
 * Whether `sentinel` has scrolled out of view above the top of the viewport.
 *
 * Read with an `IntersectionObserver` rather than a scroll handler: the
 * browser reports the crossing, nothing runs per scrolled pixel, and nothing
 * reads layout while scrolling.
 *
 * The observer only reports a change of `isIntersecting`, so a sentinel that
 * could jump from above the viewport to below it without ever crossing it (a
 * short one, on an instant scroll to the top) would leave this stuck at
 * `true`. Give it a sentinel that reaches up to the top of the document — a
 * tall box ending where "past" begins — and it intersects whenever the view
 * is above that point.
 *
 * Takes the element rather than a ref (the caller holds it through a callback
 * ref), so it observes exactly what is mounted. Without `IntersectionObserver`
 * (tests, very old browsers) it never reports past.
 */
export function useScrolledPast(sentinel: Element | null): boolean {
  const [isPast, setPast] = useState(false);
  useEffect(() => {
    if (!sentinel || typeof IntersectionObserver === 'undefined') {
      setPast(false);
      return undefined;
    }
    const observer = new IntersectionObserver(entries => {
      const entry = entries[entries.length - 1];
      if (!entry) {
        return;
      }
      const top = entry.rootBounds?.top ?? 0;
      setPast(!entry.isIntersecting && entry.boundingClientRect.bottom <= top);
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinel]);
  return isPast;
}
