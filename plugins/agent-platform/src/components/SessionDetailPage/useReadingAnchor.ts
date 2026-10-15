import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * What the timeline keeps across a change that adds or removes entries: the
 * direct children of a turn (`SessionTimeline`'s `[data-turn-index]`) other
 * than its work summaries, which are what "Show tool activity" adds and
 * removes. Messages, attachments and turn markers stay.
 */
const KEPT_ENTRIES =
  '[data-turn-index] > :not([data-testid="timeline-work-summary"])';

/** How long a captured anchor waits for its change before it is dropped. */
const ANCHOR_TIMEOUT_MS = 1000;

type ReadingAnchor = {
  /** The first kept entry in view, and where it was. */
  element: Element;
  top: number;
  /** Its turn, for when the entry itself is re-created by the change. */
  turnIndex?: string;
  turnTop?: number;
};

/**
 * Where the view's readable part begins: below the compact header, whose
 * height ShellPage puts in the document's `scroll-padding-top`.
 */
function visibleTop(): number {
  return (
    parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
  );
}

function readAnchor(): ReadingAnchor | null {
  const top = visibleTop();
  for (const element of document.querySelectorAll(KEPT_ENTRIES)) {
    const rect = element.getBoundingClientRect();
    if (rect.bottom > top) {
      const turn = element.closest<HTMLElement>('[data-turn-index]');
      return {
        element,
        top: rect.top,
        turnIndex: turn?.dataset.turnIndex,
        turnTop: turn?.getBoundingClientRect().top,
      };
    }
  }
  return null;
}

/**
 * Keeps what the person is reading where it is on screen while `value`
 * changes the timeline around it — "Show tool activity" adds or removes work
 * summaries above and below the place being read, which otherwise scrolls the
 * page to somewhere else.
 *
 * Call the returned function just before the change. It records the first
 * kept entry in view and its offset, and turns the browser's own scroll
 * anchoring off meanwhile, so the two cannot both correct the same change.
 * After the change is laid out — before paint — the page is scrolled by
 * however far that entry moved, and anchoring comes back a frame later. If
 * the entry itself was re-created, its turn is the anchor instead.
 */
export function useReadingAnchor(value: unknown): () => void {
  const anchor = useRef<ReadingAnchor | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout>>();

  const release = useCallback(() => {
    anchor.current = null;
    clearTimeout(timeout.current);
    // A frame later: the change's own layout is past by then.
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document.documentElement.style.removeProperty('overflow-anchor'),
      ),
    );
  }, []);

  const capture = useCallback(() => {
    anchor.current = readAnchor();
    if (!anchor.current) {
      return;
    }
    document.documentElement.style.overflowAnchor = 'none';
    // A change that never comes (the write refused before the switch moved)
    // must not leave the browser's anchoring off.
    clearTimeout(timeout.current);
    timeout.current = setTimeout(release, ANCHOR_TIMEOUT_MS);
  }, [release]);

  useLayoutEffect(() => {
    const current = anchor.current;
    if (!current) {
      return;
    }
    let target: Element | null = current.element;
    let before = current.top;
    if (!target.isConnected) {
      target =
        current.turnIndex !== undefined
          ? document.querySelector(`[data-turn-index="${current.turnIndex}"]`)
          : null;
      before = current.turnTop ?? 0;
    }
    if (target) {
      const moved = target.getBoundingClientRect().top - before;
      if (Math.abs(moved) >= 1) {
        window.scrollBy({ top: moved, behavior: 'instant' });
      }
    }
    release();
  }, [value, release]);

  useLayoutEffect(
    () => () => {
      clearTimeout(timeout.current);
      document.documentElement.style.removeProperty('overflow-anchor');
    },
    [],
  );

  return capture;
}
