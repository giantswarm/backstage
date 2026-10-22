import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * How near the end of the page still counts as at it (px): about two lines of
 * the conversation's text. A reader who scrolls down to within this of the end
 * is following the conversation again.
 */
export const AT_END_THRESHOLD_PX = 48;

/**
 * How long after a reader opens or closes something in the conversation (Show
 * more, a tool activity row, a `<details>` fold, the tool activity switch) a
 * change of the page's height is theirs rather than the agent's (ms).
 */
export const READER_CHANGE_MS = 500;

/** What the page's scroll position is, read off its scrolling element. */
export type ScrollMetrics = {
  /** `scrollTop`. */
  top: number;
  /** `scrollHeight`. */
  height: number;
  /** How far the view's bottom is from the page's end. */
  distance: number;
};

export function readScrollMetrics(element: Element): ScrollMetrics {
  return {
    top: element.scrollTop,
    height: element.scrollHeight,
    distance: element.scrollHeight - element.scrollTop - element.clientHeight,
  };
}

/** Whether the view shows the page's end, give or take the threshold. */
export function isAtEnd(metrics: ScrollMetrics): boolean {
  return metrics.distance <= AT_END_THRESHOLD_PX;
}

/**
 * Whether the reader follows the end after a scroll event, given whether they
 * did before and where the page was at the previous scroll.
 *
 * Moving up while the page kept its height is the reader leaving the end —
 * however little, so a nudge up is never undone by the next streamed line.
 * The browser moving the position because the page changed size (clamping when
 * it got shorter, scroll anchoring when something above changed) comes with a
 * change of height, and is not. Anything else that lands at the end (scrolling
 * back down to it, the page shrinking under the view) follows again.
 */
export function followsAfterScroll(
  following: boolean,
  previous: Pick<ScrollMetrics, 'top' | 'height'> | undefined,
  current: ScrollMetrics,
): boolean {
  if (
    previous &&
    current.top < previous.top &&
    current.height === previous.height
  ) {
    return false;
  }
  return isAtEnd(current) || following;
}

/**
 * What to do when the page's height changed: keep the end in view for a reader
 * following it; re-read whether they still are when the reader changed the
 * page themselves (they keep their place, and are following only if the end is
 * still in view); and leave everyone else exactly where they are.
 */
export function onHeightChange(
  following: boolean,
  readerChange: boolean,
  current: ScrollMetrics,
): { following: boolean; scrollToEnd: boolean } {
  if (readerChange) {
    return { following: isAtEnd(current), scrollToEnd: false };
  }
  return { following, scrollToEnd: following && current.distance > 0 };
}

/** How far a finger moves before it is a swipe rather than a tap (px). */
const TOUCH_SLOP_PX = 4;

const UP_KEYS = new Set(['ArrowUp', 'PageUp', 'Home']);

/**
 * Keys that go to the page's end. The browser scrolls there smoothly, to the
 * end as it was when pressed; a reply streaming in meanwhile would leave the
 * view short of the end and not following, so the press itself follows.
 */
function goesToEnd(event: KeyboardEvent): boolean {
  return event.key === 'End' || (event.key === 'ArrowDown' && event.metaKey);
}

/**
 * Controls that open or close part of the conversation: disclosures carry
 * `aria-expanded` (Show more, the tool activity rows), markdown folds are
 * `<summary>`, and the tool activity switch is a `role="switch"` in a label.
 */
const TOGGLES = '[aria-expanded], summary, [role="switch"]';

function isToggle(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(
    target.closest(TOGGLES) ||
    target.closest('label')?.querySelector('[role="switch"]'),
  );
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest('input, textarea, select') !== null)
  );
}

/**
 * Whether an upward wheel or swipe from `target` scrolls something inside the
 * page (a payload's scroll box, the composer's text) rather than the page.
 */
function scrollsInsideUp(target: EventTarget | null, page: Element): boolean {
  for (
    let node = target instanceof Element ? target : null;
    node && node !== page && node !== document.body;
    node = node.parentElement
  ) {
    if (node.scrollTop > 0 && node.scrollHeight > node.clientHeight) {
      const overflow = getComputedStyle(node).overflowY;
      if (overflow === 'auto' || overflow === 'scroll') {
        return true;
      }
    }
  }
  return false;
}

/**
 * Stick to the end: while the reader is at the end of the session, the page
 * stays there as the agent's reply streams in; once they scroll away, the page
 * leaves the position alone until they come back to the end.
 *
 * The page scrolls the document (SessionDetailPage), so the end is the
 * document's. Whether the reader follows it is decided by what *they* do, not
 * by how far from the end the page happens to be when content arrives: moving
 * up (wheel, swipe, arrow and page keys, the scrollbar, anything that scrolls
 * the page up without changing its height) leaves the end at once, mid-stream
 * included; scrolling back to within {@link AT_END_THRESHOLD_PX} of it, or
 * pressing End, follows again. Wheel, swipe and keys are read as they happen,
 * before the browser scrolls, so a following page never fights a scroll
 * already under way; the scroll events catch the rest.
 *
 * Content is followed by watching the conversation `column`'s size, which
 * covers everything that grows it — streamed text, the Working line, tool
 * activity, a message the poll lands, the docked composer growing — whatever
 * renders it, and scrolls before paint. A change the reader makes with a
 * toggle in the conversation (see {@link TOGGLES}) is theirs: it never scrolls
 * the page, and only re-reads whether the end is still in view. While a
 * finger is on the screen nothing is scrolled for them; momentum after it
 * lifts is read from the scroll events like any other scroll. The same holds
 * for a press on the page's scrollbar until it is released.
 *
 * Returns `stickToEnd`, for when the reader has just acted at the end: the
 * session opening, a message sent. It scrolls to the end now and follows from
 * there.
 */
export function useStickToEnd(column: HTMLElement | null): () => void {
  const following = useRef(true);
  const last = useRef<Pick<ScrollMetrics, 'top' | 'height'>>();
  const readerChangeUntil = useRef(0);
  const touchY = useRef<number | undefined>(undefined);
  /** A finger on the screen or a press on the scrollbar: the reader's. */
  const holding = useRef(false);

  const stickToEnd = useCallback(() => {
    following.current = true;
    const page = document.scrollingElement ?? document.documentElement;
    page.scrollTop = page.scrollHeight;
    last.current = { top: page.scrollTop, height: page.scrollHeight };
  }, []);

  useLayoutEffect(() => {
    if (!column) {
      return undefined;
    }
    const page = document.scrollingElement ?? document.documentElement;
    const remember = (metrics: ScrollMetrics) => {
      last.current = { top: metrics.top, height: metrics.height };
    };
    remember(readScrollMetrics(page));

    const leave = () => {
      following.current = false;
    };

    const onScroll = () => {
      const metrics = readScrollMetrics(page);
      following.current = followsAfterScroll(
        following.current,
        last.current,
        metrics,
      );
      remember(metrics);
    };

    const onResize = () => {
      const metrics = readScrollMetrics(page);
      const next = onHeightChange(
        following.current,
        performance.now() < readerChangeUntil.current,
        metrics,
      );
      following.current = next.following;
      if (next.scrollToEnd && !holding.current) {
        page.scrollTop = page.scrollHeight;
        remember(readScrollMetrics(page));
      } else {
        remember(metrics);
      }
    };

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0 && !scrollsInsideUp(event.target, page)) {
        leave();
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      touchY.current = event.touches[0]?.clientY;
      holding.current = true;
    };
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY;
      // The finger moving down the screen scrolls the page up.
      if (
        y !== undefined &&
        touchY.current !== undefined &&
        y > touchY.current + TOUCH_SLOP_PX &&
        !scrollsInsideUp(event.target, page)
      ) {
        leave();
      }
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length === 0) {
        touchY.current = undefined;
        holding.current = false;
      }
    };

    const markReaderChange = () => {
      readerChangeUntil.current = performance.now() + READER_CHANGE_MS;
    };
    const onClick = (event: MouseEvent) => {
      if (isToggle(event.target)) {
        markReaderChange();
      }
    };
    const onToggleKey = (event: KeyboardEvent) => {
      if (
        (event.key === 'Enter' || event.key === ' ') &&
        isToggle(event.target)
      ) {
        markReaderChange();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // A focused menu, list or field takes its own arrow keys (and says so
      // by preventing the page's scroll).
      if (
        event.defaultPrevented ||
        isEditable(event.target) ||
        isToggle(event.target)
      ) {
        return;
      }
      if (goesToEnd(event)) {
        following.current = true;
      } else if (
        (UP_KEYS.has(event.key) || (event.key === ' ' && event.shiftKey)) &&
        !scrollsInsideUp(event.target, page)
      ) {
        leave();
      }
    };

    // The page's own scrollbar: a press on it targets the root element (or
    // lands right of the content). The drag is the reader's until released.
    const onMouseDown = (event: MouseEvent) => {
      if (
        event.target === document.documentElement ||
        event.clientX >= document.documentElement.clientWidth
      ) {
        holding.current = true;
      }
    };
    const onMouseUp = () => {
      holding.current = false;
    };

    const passive = { passive: true } as const;
    window.addEventListener('scroll', onScroll, passive);
    window.addEventListener('wheel', onWheel, passive);
    window.addEventListener('touchstart', onTouchStart, passive);
    window.addEventListener('touchmove', onTouchMove, passive);
    window.addEventListener('touchend', onTouchEnd, passive);
    window.addEventListener('touchcancel', onTouchEnd, passive);
    // Capture: the toggle's own handler re-renders before a bubbling
    // listener would hear of it.
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onToggleKey, true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onMouseDown, passive);
    window.addEventListener('mouseup', onMouseUp, passive);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(onResize);
    observer?.observe(column);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onToggleKey, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      observer?.disconnect();
    };
  }, [column]);

  return stickToEnd;
}
