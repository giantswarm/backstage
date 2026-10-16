import { useEffect, useState } from 'react';

export type UseScrolledPastOptions = {
  /**
   * How far, in px, `sentinel` has to come back below the top of the view
   * before it counts as no longer past. Past is entered at the top edge and
   * left only this much lower, so a layout change that nudges the sentinel a
   * few pixels back and forth (content reflowing as the page reacts to the
   * change itself) cannot flip the answer back and forth.
   */
  hysteresis?: number;
};

/**
 * Whether `sentinel` has scrolled out of view above the top of the viewport.
 *
 * Read with `IntersectionObserver`s rather than a scroll handler: the browser
 * reports the crossings, nothing runs per scrolled pixel, and nothing reads
 * layout while scrolling. One observer watches the top edge, where past
 * begins; with a `hysteresis`, a second one, its root's top moved down by
 * that much, watches where past ends.
 *
 * An observer only reports a change of `isIntersecting`, so a sentinel that
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
export function useScrolledPast(
  sentinel: Element | null,
  { hysteresis = 0 }: UseScrolledPastOptions = {},
): boolean {
  const [isPast, setPast] = useState(false);
  useEffect(() => {
    if (!sentinel || typeof IntersectionObserver === 'undefined') {
      setPast(false);
      return undefined;
    }
    const last = (entries: IntersectionObserverEntry[]) =>
      entries[entries.length - 1];
    // The top edge: past once the sentinel is above it; back once it is
    // below the view (an initial read of a page opened further down) or,
    // without hysteresis, back in view.
    const edge = new IntersectionObserver(entries => {
      const entry = last(entries);
      if (!entry) {
        return;
      }
      const top = entry.rootBounds?.top ?? 0;
      if (!entry.isIntersecting) {
        setPast(entry.boundingClientRect.bottom <= top);
      } else if (hysteresis <= 0) {
        setPast(false);
      }
    });
    edge.observe(sentinel);
    // `hysteresis` px lower: back once the sentinel reaches below that.
    const release =
      hysteresis > 0
        ? new IntersectionObserver(
            entries => {
              if (last(entries)?.isIntersecting) {
                setPast(false);
              }
            },
            { rootMargin: `-${hysteresis}px 0px 0px 0px` },
          )
        : undefined;
    release?.observe(sentinel);
    return () => {
      edge.disconnect();
      release?.disconnect();
    };
  }, [sentinel, hysteresis]);
  return isPast;
}
