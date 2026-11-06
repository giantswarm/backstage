import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { SHELL_PAGE_COMPACT_HEADER_HEIGHT_VAR } from '@giantswarm/backstage-plugin-ui-react';
import { READER_CHANGE_MS, closestToggle } from '../../hooks/useStickToEnd';
import { RESERVED_TURN_ATTRIBUTE } from '../SessionTimeline';

/**
 * How far below the visible part of the conversation its newest content may
 * reach and still count as seen (px): less than a line, so a line cut by the
 * composer's edge does not count as content below.
 */
export const SEEN_SLACK_PX = 8;

/**
 * How much the content below the visible part has to grow before it counts
 * as new (px): less than a line, more than a re-render that settles a few
 * pixels.
 */
export const NEW_CONTENT_MIN_PX = 8;

/**
 * How long after the session opens the page keeps landing at its end while
 * its layout settles (the dock's measured height, fonts) (ms). Any scrolling
 * input from the reader ends it at once.
 */
export const OPEN_SETTLE_MS = 500;

/**
 * How long a smooth jump to the bottom may take before it is finished with an
 * instant scroll (ms). Also the fallback where `scrollend` is not sent.
 */
export const JUMP_MAX_MS = 1500;

/**
 * Marks a child of the conversation column that is not conversation: the
 * docked composer and the jump button's anchor. The newest content is the
 * last child without it.
 */
export const END_CHROME_ATTRIBUTE = 'data-end-chrome';

/** Whether there is new content below, and how much was below when last seen. */
export type BelowState = {
  /** Content arrived below the visible part since the reader last saw the end. */
  unseen: boolean;
  /**
   * How far the newest content reached below the visible part when the
   * reader last scrolled or changed the conversation (px; negative while the
   * end is in view). Growth past it is content that arrived.
   */
  base: number;
};

/**
 * After the reader scrolled: reaching the end clears the button; anywhere
 * else keeps it as it was, and what is below now is what they have seen.
 */
export function afterScroll(state: BelowState, hidden: number): BelowState {
  return {
    unseen: hidden <= SEEN_SLACK_PX ? false : state.unseen,
    base: hidden,
  };
}

/**
 * After the conversation changed size. Content that grows below the visible
 * part is new — unless the reader changed it themselves (a disclosure, the
 * tool activity switch, a narrower window), or a jump to the bottom is under
 * way. Content that ends in view is seen.
 */
export function afterContentChange(
  state: BelowState,
  hidden: number,
  { readerChange, jumping }: { readerChange: boolean; jumping: boolean },
): BelowState {
  if (hidden <= SEEN_SLACK_PX) {
    return { unseen: false, base: hidden };
  }
  if (readerChange) {
    return { unseen: state.unseen, base: hidden };
  }
  if (!jumping && hidden - state.base > NEW_CONTENT_MIN_PX) {
    return { unseen: true, base: state.base };
  }
  return state;
}

function px(value: string): number {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rootVariable(name: string): number {
  return px(getComputedStyle(document.documentElement).getPropertyValue(name));
}

/** Where the newest content ends, in viewport coordinates. */
function contentEnd(column: Element): number {
  const reserved = column.querySelector(`[${RESERVED_TURN_ATTRIBUTE}]`);
  if (reserved?.lastElementChild) {
    return reserved.lastElementChild.getBoundingClientRect().bottom;
  }
  for (let i = column.children.length - 1; i >= 0; i--) {
    const child = column.children[i];
    if (!child.hasAttribute(END_CHROME_ATTRIBUTE)) {
      return child.getBoundingClientRect().bottom;
    }
  }
  return column.getBoundingClientRect().top;
}

/**
 * How far the newest content reaches below the visible part of the
 * conversation (px; negative while it ends in view): below the docked
 * composer's top edge, or the view's bottom (above the shell's mobile bar)
 * where there is no composer.
 */
export function hiddenBelow(column: Element, dock: Element | null): number {
  const bottom = dock
    ? dock.getBoundingClientRect().top
    : document.documentElement.clientHeight -
      rootVariable('--agent-shell-mobile-bar-height');
  return contentEnd(column) - bottom;
}

function scrollingElement(): Element {
  return document.scrollingElement ?? document.documentElement;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * The session page's reading position: content from the agent never moves
 * it, and content that lands below the visible part offers a way down.
 *
 * - The page opens at its end (`openAtEnd`) and lands there while its layout
 *   settles, until {@link OPEN_SETTLE_MS} have passed or the reader scrolls.
 * - Sending a message is the reader's own action: `revealTurn` puts the new
 *   turn at the top of the view, below the compact header, and the timeline
 *   holds room under it for the reply, so the reply streams into view without
 *   the page moving.
 * - Nothing else scrolls: not a streamed token, a second message, tool
 *   activity, a new turn, and not while the reader is at the end either.
 *   Content that grows below the visible part sets `hasNewBelow`, the jump
 *   button's cue; the reader reaching the end themselves — scrolling, End,
 *   `jumpToBottom` — clears it.
 * - A change the reader makes (`markReaderChange`, the conversation's
 *   disclosures, a window resize) is not new content.
 * - The docked composer growing (a multi-line message, a question card) while
 *   the end is in view keeps the end in view: the visible part shrank, no
 *   content arrived.
 *
 * `column` is the conversation column, `dock` the docked composer (null where
 * the composer is withheld). The page scrolls the document.
 */
export function useJumpToBottom(
  column: HTMLElement | null,
  dock: HTMLElement | null,
): {
  hasNewBelow: boolean;
  jumpToBottom: () => void;
  openAtEnd: () => void;
  revealTurn: (turn: HTMLElement) => void;
  markReaderChange: () => void;
} {
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const state = useRef<BelowState>({ unseen: false, base: 0 });
  const lastHidden = useRef(0);
  const readerChangeUntil = useRef(0);
  const settleUntil = useRef(0);
  const jumpTimer = useRef<ReturnType<typeof setTimeout>>();
  const inputs = useRef(0);
  const elements = useRef({ column, dock });
  elements.current = { column, dock };

  const measure = useCallback((): number | undefined => {
    const current = elements.current;
    return current.column
      ? hiddenBelow(current.column, current.dock)
      : undefined;
  }, []);

  const apply = useCallback((next: BelowState, hidden: number) => {
    state.current = next;
    lastHidden.current = hidden;
    setHasNewBelow(next.unseen);
  }, []);

  /** Everything is in view up to the end: the cue goes, from here on. */
  const seen = useCallback(() => {
    const hidden = measure();
    if (hidden !== undefined) {
      apply({ unseen: false, base: hidden }, hidden);
    }
  }, [apply, measure]);

  const markReaderChange = useCallback(() => {
    readerChangeUntil.current = performance.now() + READER_CHANGE_MS;
  }, []);

  const openAtEnd = useCallback(() => {
    const element = scrollingElement();
    element.scrollTop = element.scrollHeight;
    settleUntil.current = performance.now() + OPEN_SETTLE_MS;
    seen();
  }, [seen]);

  const revealTurn = useCallback(
    (turn: HTMLElement) => {
      // jsdom has no scrollIntoView.
      if (typeof turn.scrollIntoView !== 'function') {
        seen();
        return;
      }
      // The turn's `scroll-margin-top` (ShellPage) keeps it below the
      // compact header.
      turn.scrollIntoView({ block: 'start' });
      seen();
      // The scroll can turn the header compact, which then covers the turn's
      // top: once that has landed, line it up again — unless the reader has
      // scrolled meanwhile.
      const before = inputs.current;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const covered =
            turn.getBoundingClientRect().top <
            rootVariable(SHELL_PAGE_COMPACT_HEADER_HEIGHT_VAR);
          if (inputs.current === before && turn.isConnected && covered) {
            turn.scrollIntoView({ block: 'start' });
          }
        }),
      );
    },
    [seen],
  );

  const finishJump = useCallback(() => {
    if (jumpTimer.current === undefined) {
      return;
    }
    clearTimeout(jumpTimer.current);
    jumpTimer.current = undefined;
    // Content that streamed in during the smooth scroll lies past where it
    // was headed: finish at the very bottom.
    const hidden = measure();
    if (hidden !== undefined && hidden > SEEN_SLACK_PX) {
      const element = scrollingElement();
      element.scrollTop = element.scrollHeight;
    }
    seen();
  }, [measure, seen]);

  const jumpToBottom = useCallback(() => {
    const element = scrollingElement();
    state.current = { ...state.current, unseen: false };
    setHasNewBelow(false);
    if (prefersReducedMotion() || typeof window.scrollTo !== 'function') {
      element.scrollTop = element.scrollHeight;
      seen();
      return;
    }
    clearTimeout(jumpTimer.current);
    jumpTimer.current = setTimeout(finishJump, JUMP_MAX_MS);
    window.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }, [finishJump, seen]);

  useLayoutEffect(() => {
    if (!column) {
      return undefined;
    }
    let lastDockHeight = dock?.offsetHeight ?? 0;
    const initial = hiddenBelow(column, dock);
    apply({ unseen: state.current.unseen, base: initial }, initial);

    const onScroll = () => {
      const hidden = hiddenBelow(column, dock);
      apply(afterScroll(state.current, hidden), hidden);
      const element = scrollingElement();
      if (
        jumpTimer.current !== undefined &&
        element.scrollHeight - element.scrollTop - element.clientHeight <= 1
      ) {
        finishJump();
      }
    };

    const onResize = () => {
      const now = performance.now();
      const element = scrollingElement();
      if (now < settleUntil.current) {
        element.scrollTop = element.scrollHeight;
        lastDockHeight = dock?.offsetHeight ?? 0;
        const hidden = hiddenBelow(column, dock);
        apply({ unseen: false, base: hidden }, hidden);
        return;
      }
      const dockHeight = dock?.offsetHeight ?? 0;
      const dockGrew = dockHeight - lastDockHeight;
      lastDockHeight = dockHeight;
      let hidden = hiddenBelow(column, dock);
      let current = state.current;
      if (dockGrew !== 0) {
        // The visible part's bottom moved, not the content.
        current = { ...current, base: current.base + dockGrew };
        if (
          dockGrew > 0 &&
          lastHidden.current <= SEEN_SLACK_PX &&
          hidden > SEEN_SLACK_PX
        ) {
          window.scrollBy(0, Math.min(dockGrew, hidden - lastHidden.current));
          hidden = hiddenBelow(column, dock);
        }
      }
      apply(
        afterContentChange(current, hidden, {
          readerChange: now < readerChangeUntil.current,
          jumping: jumpTimer.current !== undefined,
        }),
        hidden,
      );
    };

    // The reader taking over: the open stops settling, a smooth jump stops
    // being one (the browser cancels it), a reveal is not lined up again.
    const onInput = () => {
      inputs.current += 1;
      settleUntil.current = 0;
      if (jumpTimer.current !== undefined) {
        clearTimeout(jumpTimer.current);
        jumpTimer.current = undefined;
      }
    };

    const onToggle = (event: Event) => {
      const toggle = closestToggle(event.target);
      if (
        toggle &&
        column.contains(toggle) &&
        (event.type === 'click' ||
          (event as KeyboardEvent).key === 'Enter' ||
          (event as KeyboardEvent).key === ' ')
      ) {
        markReaderChange();
      }
    };

    const passive = { passive: true } as const;
    window.addEventListener('scroll', onScroll, passive);
    window.addEventListener('scrollend', finishJump, passive);
    window.addEventListener('resize', markReaderChange, passive);
    window.addEventListener('wheel', onInput, passive);
    window.addEventListener('touchstart', onInput, passive);
    window.addEventListener('mousedown', onInput, passive);
    window.addEventListener('keydown', onInput, passive);
    // Capture: the toggle's own handler re-renders before a bubbling
    // listener would hear of it.
    window.addEventListener('click', onToggle, true);
    window.addEventListener('keydown', onToggle, true);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(onResize);
    observer?.observe(column);
    // The chrome around the column moves where it ends, too.
    observer?.observe(document.body);
    if (dock) {
      observer?.observe(dock);
    }
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('scrollend', finishJump);
      window.removeEventListener('resize', markReaderChange);
      window.removeEventListener('wheel', onInput);
      window.removeEventListener('touchstart', onInput);
      window.removeEventListener('mousedown', onInput);
      window.removeEventListener('keydown', onInput);
      window.removeEventListener('click', onToggle, true);
      window.removeEventListener('keydown', onToggle, true);
      observer?.disconnect();
    };
  }, [column, dock, apply, finishJump, markReaderChange]);

  return { hasNewBelow, jumpToBottom, openAtEnd, revealTurn, markReaderChange };
}
