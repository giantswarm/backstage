import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * How near the end of the conversation still counts as at it (px): about two
 * lines of its text. A reader who scrolls down to within this of the end is
 * following the conversation again.
 */
export const AT_END_THRESHOLD_PX = 48;

/**
 * How long after a reader opens or closes something in the conversation (Show
 * more, a tool activity row, a `<details>` fold, the tool activity switch) a
 * change of its height is theirs rather than the agent's (ms).
 */
export const READER_CHANGE_MS = 500;

/**
 * How long a press on the scrollbar holds the position without a scroll, a
 * release or a `scrollend` (ms). Chromium sends no `mouseup` after dragging
 * the scrollbar, so the hold cannot wait for one.
 */
export const SCROLLBAR_HOLD_MS = 1000;

/** What the scroller's position is, read off its scrolling element. */
export type ScrollMetrics = {
  /** `scrollTop`. */
  top: number;
  /** `scrollHeight`. */
  height: number;
  /** How far the view's bottom is from the end. */
  distance: number;
};

export function readScrollMetrics(element: Element): ScrollMetrics {
  return {
    top: element.scrollTop,
    height: element.scrollHeight,
    distance: element.scrollHeight - element.scrollTop - element.clientHeight,
  };
}

/** Whether the view shows the end, give or take the threshold. */
export function isAtEnd(metrics: ScrollMetrics): boolean {
  return metrics.distance <= AT_END_THRESHOLD_PX;
}

/**
 * Whether the reader follows the end after a scroll event, given whether they
 * did before and where the scroller was when last read.
 *
 * Moving up by more than the content shrank is the reader leaving the end —
 * however little, so a nudge up is never undone by the next streamed line,
 * and also when a streamed chunk landed in the same frame as their scroll.
 * The browser moving the position because the content changed size (clamping
 * when it got shorter, scroll anchoring when something above went) moves it
 * by no more than that, and is not. Anything that lands at the end (scrolling
 * back down to it, the content shrinking under the view) follows again.
 */
export function followsAfterScroll(
  following: boolean,
  previous: Pick<ScrollMetrics, 'top' | 'height'> | undefined,
  current: ScrollMetrics,
): boolean {
  if (previous) {
    const up = previous.top - current.top;
    const shrank = Math.max(0, previous.height - current.height);
    // A pixel's slack for sub-pixel layout.
    if (up > shrank + 1) {
      return false;
    }
  }
  return isAtEnd(current) || following;
}

/**
 * What to do when the content's height changed: keep the end in view for a
 * reader following it; re-read whether they still are when the reader changed
 * the content themselves (they keep their place, and are following only if the
 * end is still in view); and leave everyone else exactly where they are.
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
 * Keys that go to the end. The browser scrolls there smoothly, to the end as
 * it was when pressed; a reply streaming in meanwhile would leave the view
 * short of the end and not following, so the press itself follows.
 */
function goesToEnd(event: KeyboardEvent): boolean {
  return event.key === 'End' || (event.key === 'ArrowDown' && event.metaKey);
}

/**
 * Disclosures in the conversation: `aria-expanded` (Show more, the tool
 * activity rows) and markdown's `<summary>` folds, which have no handler of
 * ours to announce themselves. Only inside the observed content: a menu
 * button elsewhere on the page carries `aria-expanded` too.
 */
const TOGGLES = '[aria-expanded], summary';

function closestToggle(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest(TOGGLES) : null;
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest('input, textarea, select') !== null)
  );
}

/** Space on a control presses it rather than scrolling. */
function isControl(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('button, a, summary, [role="button"]') !== null
  );
}

function isScrollable(style: CSSStyleDeclaration): boolean {
  return style.overflowY === 'auto' || style.overflowY === 'scroll';
}

/**
 * Whether an upward wheel or swipe from `target` stays inside something within
 * the scroller (a payload's scroll box, the composer's text, a lightbox) rather
 * than moving the scroller: a box that can still scroll up takes it, and one
 * at its top with `overscroll-behavior` set does not pass it on.
 */
function staysInside(target: EventTarget | null, scroller: Element): boolean {
  for (
    let node = target instanceof Element ? target : null;
    node &&
    node !== scroller &&
    node !== document.body &&
    node !== document.documentElement;
    node = node.parentElement
  ) {
    if (node.scrollHeight > node.clientHeight) {
      const style = getComputedStyle(node);
      if (isScrollable(style)) {
        if (node.scrollTop > 0) {
          return true;
        }
        if (style.overscrollBehaviorY && style.overscrollBehaviorY !== 'auto') {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Stick to the end: while the reader is at the end of a conversation, it
 * stays there as the agent's reply streams in; once they scroll away, their
 * position is left alone until they come back to the end.
 *
 * `scroller` is what scrolls — `'document'` for a page that scrolls the
 * document (the session page), or a scroll box (the Create agent assist
 * panel; `null` until it mounts) — and `content` what grows inside it.
 *
 * Whether the reader follows the end is decided by what *they* do, not by
 * how far from the end the view happens to be when content arrives: moving up
 * (wheel, swipe, arrow and page keys, the scrollbar, anything that moves the
 * view up by more than the content shrank) leaves the end at once, mid-stream
 * included; scrolling back to within {@link AT_END_THRESHOLD_PX} of it, or
 * pressing End, follows again. Wheel, swipe and keys are read as they happen,
 * before the browser scrolls, so a following view never fights a scroll
 * already under way; the scroll events catch the rest. Input that cannot move
 * the scroller up — at its top, scroll-locked behind a dialog, a pinch zoom,
 * a box inside taking the scroll — leaves nothing.
 *
 * Content is followed by watching the size of `content` (and, on the
 * document, of the body, for the chrome around it), which covers everything
 * that grows it — streamed text, the Working line, tool activity, a message
 * the poll lands, the docked composer growing — whatever renders it, and
 * scrolls before paint. A change the reader makes is theirs: it never scrolls,
 * and only re-reads whether the end is still in view. Disclosures inside
 * `content` are recognised as they are pressed (see {@link TOGGLES}); a
 * control elsewhere that changes the conversation calls `markReaderChange`
 * just before it does. While a finger is on the screen, or for a moment after
 * a press on the scrollbar, nothing is scrolled for the reader; momentum
 * after the finger lifts is read from the scroll events like any other scroll.
 *
 * Returns `stickToEnd`, for when the reader has just acted at the end — the
 * conversation opening, a message sent: it scrolls to the end now and follows
 * from there — and `markReaderChange`.
 */
export function useStickToEnd(
  content: HTMLElement | null,
  scroller: HTMLElement | null | 'document' = 'document',
): { stickToEnd: () => void; markReaderChange: () => void } {
  const following = useRef(true);
  const last = useRef<Pick<ScrollMetrics, 'top' | 'height'>>();
  const readerChangeUntil = useRef(0);

  const scrollingElement = useCallback(
    (): Element | null =>
      scroller === 'document'
        ? (document.scrollingElement ?? document.documentElement)
        : scroller,
    [scroller],
  );

  const stickToEnd = useCallback(() => {
    following.current = true;
    const element = scrollingElement();
    if (!element) {
      return;
    }
    element.scrollTop = element.scrollHeight;
    last.current = { top: element.scrollTop, height: element.scrollHeight };
  }, [scrollingElement]);

  const markReaderChange = useCallback(() => {
    readerChangeUntil.current = performance.now() + READER_CHANGE_MS;
  }, []);

  useLayoutEffect(() => {
    const element = scrollingElement();
    if (!content || !element) {
      return undefined;
    }
    const onDocument = scroller === 'document';
    const remember = (metrics: ScrollMetrics) => {
      last.current = { top: metrics.top, height: metrics.height };
    };
    remember(readScrollMetrics(element));

    let touchHold: { y: number; target: EventTarget } | undefined;
    let scrollbarHold: ReturnType<typeof setTimeout> | undefined;
    const isHeld = () => touchHold !== undefined || scrollbarHold !== undefined;

    const isWithin = (target: EventTarget | null) =>
      onDocument || (target instanceof Node && element.contains(target));

    /** Whether the scroller can move up at all right now. */
    const canMoveUp = () => {
      if (element.scrollTop <= 0) {
        return false;
      }
      // A modal dialog locks the page (react-aria on the root, MUI on the
      // body).
      const locked = onDocument
        ? [document.documentElement, document.body]
        : [element];
      return locked.every(
        node => getComputedStyle(node).overflowY !== 'hidden',
      );
    };

    const leave = () => {
      following.current = false;
    };

    const releaseScrollbar = () => {
      clearTimeout(scrollbarHold);
      scrollbarHold = undefined;
    };
    const holdScrollbar = () => {
      clearTimeout(scrollbarHold);
      scrollbarHold = setTimeout(releaseScrollbar, SCROLLBAR_HOLD_MS);
    };

    const onScroll = () => {
      const metrics = readScrollMetrics(element);
      following.current = followsAfterScroll(
        following.current,
        last.current,
        metrics,
      );
      remember(metrics);
      if (scrollbarHold !== undefined) {
        holdScrollbar();
      }
    };

    const onResize = () => {
      const metrics = readScrollMetrics(element);
      const next = onHeightChange(
        following.current,
        performance.now() < readerChangeUntil.current,
        metrics,
      );
      following.current = next.following;
      if (next.scrollToEnd && !isHeld()) {
        element.scrollTop = element.scrollHeight;
        remember(readScrollMetrics(element));
      } else {
        remember(metrics);
      }
    };

    const onWheel = (event: WheelEvent) => {
      // A pinch zoom arrives as a wheel with ctrl held.
      if (!following.current || event.deltaY >= 0 || event.ctrlKey) {
        return;
      }
      if (
        isWithin(event.target) &&
        canMoveUp() &&
        !staysInside(event.target, element)
      ) {
        leave();
      }
    };

    // Touch events go to the node the finger first touched, even once it has
    // left the document (a streamed text run re-mounted under the finger), so
    // the rest of the gesture is heard there, not on the window.
    const onTouchMove = (event: Event) => {
      const y = (event as TouchEvent).touches[0]?.clientY;
      if (!following.current || !touchHold || y === undefined) {
        return;
      }
      // The finger moving down the screen scrolls up.
      if (
        y > touchHold.y + TOUCH_SLOP_PX &&
        canMoveUp() &&
        !staysInside(touchHold.target, element)
      ) {
        leave();
      }
    };
    const releaseTouch = () => {
      if (!touchHold) {
        return;
      }
      const { target } = touchHold;
      target.removeEventListener('touchmove', onTouchMove);
      target.removeEventListener('touchend', onTouchEnd);
      target.removeEventListener('touchcancel', onTouchEnd);
      touchHold = undefined;
    };
    function onTouchEnd(event: Event) {
      if ((event as TouchEvent).touches.length === 0) {
        releaseTouch();
      }
    }
    const onTouchStart = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY;
      if (!event.target || y === undefined || !isWithin(event.target)) {
        return;
      }
      releaseTouch();
      touchHold = { y, target: event.target };
      const passive = { passive: true } as const;
      event.target.addEventListener('touchmove', onTouchMove, passive);
      event.target.addEventListener('touchend', onTouchEnd, passive);
      event.target.addEventListener('touchcancel', onTouchEnd, passive);
    };

    // A press on the scroller's own scrollbar: on the document it targets the
    // root (or lands right of the content); on a box, the box past its
    // content width. Firefox sends nothing for the viewport's scrollbar; its
    // drags are read from the scroll events alone.
    const onMouseDown = (event: MouseEvent) => {
      const onBar = onDocument
        ? event.target === document.documentElement ||
          event.clientX >= document.documentElement.clientWidth
        : event.target === element && event.offsetX >= element.clientWidth;
      if (onBar) {
        holdScrollbar();
      }
    };

    const onClick = (event: MouseEvent) => {
      const toggle = closestToggle(event.target);
      if (toggle && content.contains(toggle)) {
        markReaderChange();
      }
    };
    const onToggleKey = (event: KeyboardEvent) => {
      const toggle = closestToggle(event.target);
      if (
        (event.key === 'Enter' || event.key === ' ') &&
        toggle &&
        content.contains(toggle)
      ) {
        markReaderChange();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // A focused menu, list or field takes its own keys (and says so by
      // preventing the scroll).
      if (
        event.defaultPrevented ||
        isEditable(event.target) ||
        !isWithin(event.target)
      ) {
        return;
      }
      if (goesToEnd(event)) {
        following.current = true;
        return;
      }
      const up =
        UP_KEYS.has(event.key) ||
        (event.key === ' ' && event.shiftKey && !isControl(event.target));
      if (
        up &&
        following.current &&
        canMoveUp() &&
        !staysInside(event.target, element)
      ) {
        leave();
      }
    };

    const scrollTarget: EventTarget = onDocument ? window : element;
    const passive = { passive: true } as const;
    scrollTarget.addEventListener('scroll', onScroll, passive);
    scrollTarget.addEventListener('scrollend', releaseScrollbar, passive);
    window.addEventListener('wheel', onWheel, passive);
    window.addEventListener('touchstart', onTouchStart, passive);
    window.addEventListener('mousedown', onMouseDown, passive);
    window.addEventListener('pointerup', releaseScrollbar, passive);
    window.addEventListener('pointercancel', releaseScrollbar, passive);
    window.addEventListener('blur', releaseScrollbar);
    // Capture: the toggle's own handler re-renders before a bubbling
    // listener would hear of it.
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onToggleKey, true);
    // Bubbling, on the window: after React's handlers, so a menu's own
    // `preventDefault` is seen.
    window.addEventListener('keydown', onKeyDown);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(onResize);
    observer?.observe(content);
    // On the document, the chrome around the conversation moves its end too
    // (the title replacing its skeleton, the header compacting).
    observer?.observe(onDocument ? document.body : element);

    return () => {
      scrollTarget.removeEventListener('scroll', onScroll);
      scrollTarget.removeEventListener('scrollend', releaseScrollbar);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('pointerup', releaseScrollbar);
      window.removeEventListener('pointercancel', releaseScrollbar);
      window.removeEventListener('blur', releaseScrollbar);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onToggleKey, true);
      window.removeEventListener('keydown', onKeyDown);
      observer?.disconnect();
      releaseTouch();
      releaseScrollbar();
    };
  }, [content, scroller, scrollingElement, markReaderChange]);

  return { stickToEnd, markReaderChange };
}
