import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  SHELL_PAGE_COMPACT_HEADER_HEIGHT_VAR,
  useMediaQueryMatch,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  READER_CHANGE_MS,
  closestToggle,
  isControl,
  isEditable,
} from '../../../hooks/useStickToEnd';
import { RESERVED_TURN_ATTRIBUTE } from '../../SessionTimeline';
import { cssPx } from '../useDockedComposerLayout';

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

const SHELL_MOBILE_BAR_HEIGHT_VAR = '--agent-shell-mobile-bar-height';

/** Keys that scroll the page when nothing focused takes them. */
const SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
]);

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
 * else keeps it as it was, and what is below now is what they have seen —
 * less what `arrived` meanwhile: content that grew below in the frame of the
 * scroll, which the scroll event hears of before the size observer does, and
 * which the observer then counts as new.
 */
export function afterScroll(
  state: BelowState,
  hidden: number,
  arrived = 0,
): BelowState {
  if (hidden <= SEEN_SLACK_PX) {
    return { unseen: false, base: hidden };
  }
  return { unseen: state.unseen, base: hidden - arrived };
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

function rootVariable(name: string): number {
  return cssPx(
    getComputedStyle(document.documentElement).getPropertyValue(name),
  );
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

function scrollingElement(): Element {
  return document.scrollingElement ?? document.documentElement;
}

/** Where the conversation is, as read at one moment. */
type Reading = {
  /**
   * How far the newest content reaches below the visible part (px; negative
   * while it ends in view).
   */
  hidden: number;
  /** Where the newest content ends, in document coordinates. */
  end: number;
  /**
   * The visible part's bottom edge, in viewport coordinates: the docked
   * composer's top edge, or the view's bottom above the shell's mobile bar
   * where there is no composer.
   */
  bottom: number;
  /** The document's `scrollTop`. */
  top: number;
};

function read(
  column: Element,
  dock: Element | null,
  mobileBarHeight: number,
): Reading {
  const top = scrollingElement().scrollTop;
  const bottom = dock
    ? dock.getBoundingClientRect().top
    : document.documentElement.clientHeight - mobileBarHeight;
  const end = contentEnd(column);
  return { hidden: end - bottom, end: end + top, bottom, top };
}

/**
 * Whether an input scrolls the page, and so stops a smooth scroll under way:
 * a wheel, a touch, a press on the document's scrollbar, a scrolling key that
 * no field, control or menu takes.
 */
function scrollsThePage(event: Event): boolean {
  if (event.type === 'wheel') {
    // A pinch zoom arrives as a wheel with ctrl held.
    return !(event as WheelEvent).ctrlKey;
  }
  if (event.type === 'touchstart') {
    return true;
  }
  if (event.type === 'mousedown') {
    const { target, clientX } = event as MouseEvent;
    return (
      target === document.documentElement ||
      clientX >= document.documentElement.clientWidth
    );
  }
  const { key, target, defaultPrevented } = event as KeyboardEvent;
  return (
    SCROLL_KEYS.has(key) &&
    !defaultPrevented &&
    !isEditable(target) &&
    !(key === ' ' && isControl(target))
  );
}

/**
 * The session page's reading position: content from the agent never moves
 * it, and content that lands below the visible part offers a way down.
 *
 * - The page opens at its end (`openAtEnd`) and lands there again as layout
 *   that comes after settles (the dock's measured height, a font, an image
 *   decoding), until the reader does anything or `conversation` changes:
 *   what arrives then is the agent's.
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
 *   disclosures, a window made narrower or wider) is not new content.
 * - The visible part getting shorter — the docked composer growing, a phone's
 *   address bar coming back — is not new content either. The composer growing
 *   while the end is in view keeps the end in view.
 *
 * `column` is the conversation column, `dock` the docked composer (null where
 * the composer is withheld), `conversation` what the timeline shows. The page
 * scrolls the document.
 */
export function useJumpToBottom(
  column: HTMLElement | null,
  dock: HTMLElement | null,
  conversation: unknown,
): {
  hasNewBelow: boolean;
  jumpToBottom: () => void;
  openAtEnd: () => void;
  revealTurn: (turn: HTMLElement) => void;
  markReaderChange: () => void;
} {
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const state = useRef<BelowState>({ unseen: false, base: 0 });
  const last = useRef<Reading>({ hidden: 0, end: 0, bottom: 0, top: 0 });
  const readerChangeUntil = useRef(0);
  /** The conversation the page opened on, while the open still settles. */
  const settling = useRef<{ conversation: unknown } | null>(null);
  const jumpTimer = useRef<ReturnType<typeof setTimeout>>();
  const inputs = useRef(0);
  const mobileBarHeight = useRef(0);
  const latest = useRef({ column, dock, conversation });
  latest.current = { column, dock, conversation };
  const reducedMotion = useMediaQueryMatch('(prefers-reduced-motion: reduce)');
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  const measure = useCallback((): Reading | undefined => {
    const current = latest.current;
    return current.column
      ? read(current.column, current.dock, mobileBarHeight.current)
      : undefined;
  }, []);

  const apply = useCallback((next: BelowState, reading: Reading) => {
    state.current = next;
    last.current = reading;
    setHasNewBelow(next.unseen);
  }, []);

  /** Everything is in view up to the end: the cue goes, from here on. */
  const seen = useCallback(() => {
    const reading = measure();
    if (reading) {
      apply({ unseen: false, base: reading.hidden }, reading);
    }
  }, [apply, measure]);

  const markReaderChange = useCallback(() => {
    readerChangeUntil.current = performance.now() + READER_CHANGE_MS;
  }, []);

  const openAtEnd = useCallback(() => {
    const element = scrollingElement();
    element.scrollTop = element.scrollHeight;
    settling.current = { conversation: latest.current.conversation };
    seen();
  }, [seen]);

  const revealTurn = useCallback(
    (turn: HTMLElement) => {
      settling.current = null;
      // The turn's `scroll-margin-top` (ShellPage) keeps it below the
      // compact header.
      turn.scrollIntoView({ block: 'start' });
      seen();
      // The scroll can turn the header compact, which then covers the turn's
      // top: once that has landed, line it up again — unless the reader has
      // done something meanwhile.
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
    const reading = measure();
    if (reading && reading.hidden > SEEN_SLACK_PX) {
      const element = scrollingElement();
      element.scrollTop = element.scrollHeight;
    }
    seen();
  }, [measure, seen]);

  const jumpToBottom = useCallback(() => {
    const element = scrollingElement();
    state.current = { ...state.current, unseen: false };
    setHasNewBelow(false);
    if (reducedMotionRef.current) {
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
    mobileBarHeight.current = rootVariable(SHELL_MOBILE_BAR_HEIGHT_VAR);
    let lastDockHeight = dock?.offsetHeight ?? 0;
    let lastWidth = window.innerWidth;
    const readNow = () => read(column, dock, mobileBarHeight.current);
    const initial = readNow();
    apply({ unseen: state.current.unseen, base: initial.hidden }, initial);

    const onScroll = () => {
      const reading = readNow();
      const scrolled = reading.top - last.current.top;
      const grew = reading.end - last.current.end;
      // Something above the view changed size and the browser kept the
      // place (scroll anchoring): the view moved with the content, and
      // nothing arrived below.
      const anchored = Math.abs(grew) > 1 && Math.abs(grew - scrolled) <= 1;
      apply(
        afterScroll(state.current, reading.hidden, anchored ? 0 : grew),
        reading,
      );
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
      const dockHeight = dock?.offsetHeight ?? 0;
      const dockGrew = dockHeight - lastDockHeight;
      lastDockHeight = dockHeight;
      if (
        settling.current &&
        settling.current.conversation !== latest.current.conversation
      ) {
        settling.current = null;
      }
      if (settling.current) {
        element.scrollTop = element.scrollHeight;
        const reading = readNow();
        apply({ unseen: false, base: reading.hidden }, reading);
        return;
      }
      const previous = last.current;
      let reading = readNow();
      let current = state.current;
      // The visible part's bottom moved up (the dock grew, the address bar
      // came back) or down, not the content.
      const shrank = previous.bottom - reading.bottom;
      if (shrank !== 0) {
        current = { ...current, base: current.base + shrank };
      }
      if (
        dockGrew > 0 &&
        previous.hidden <= SEEN_SLACK_PX &&
        reading.hidden > SEEN_SLACK_PX
      ) {
        window.scrollBy(
          0,
          Math.min(dockGrew, reading.hidden - previous.hidden),
        );
        reading = readNow();
      }
      apply(
        afterContentChange(current, reading.hidden, {
          readerChange: now < readerChangeUntil.current,
          jumping: jumpTimer.current !== undefined,
        }),
        reading,
      );
    };

    // The reader doing anything: the open stops settling, a reveal is not
    // lined up again. Only input that scrolls stops a smooth jump: the
    // browser cancels it then, and not for a key typed in the composer.
    const onInput = (event: Event) => {
      inputs.current += 1;
      settling.current = null;
      if (jumpTimer.current !== undefined && scrollsThePage(event)) {
        clearTimeout(jumpTimer.current);
        jumpTimer.current = undefined;
      }
    };

    // A narrower or wider window lays the conversation out again; a height
    // change (a phone's address bar) only moves the visible part's bottom,
    // which `onResize` takes care of.
    const onWindowResize = () => {
      mobileBarHeight.current = rootVariable(SHELL_MOBILE_BAR_HEIGHT_VAR);
      if (window.innerWidth !== lastWidth) {
        lastWidth = window.innerWidth;
        markReaderChange();
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

    const observer = new ResizeObserver(onResize);
    observer.observe(column);
    // The chrome around the column moves where it ends, too.
    observer.observe(document.body);
    if (dock) {
      observer.observe(dock);
    }
    // The turn just sent is taller than what it holds, so its reply grows
    // inside it without resizing the column: watch what it holds.
    let watched: Element[] = [];
    const watchReservedTurn = () => {
      const reserved = column.querySelector(`[${RESERVED_TURN_ATTRIBUTE}]`);
      const next = reserved ? Array.from(reserved.children) : [];
      for (const element of watched) {
        if (!next.includes(element)) {
          observer.unobserve(element);
        }
      }
      for (const element of next) {
        if (!watched.includes(element)) {
          observer.observe(element);
        }
      }
      watched = next;
    };
    watchReservedTurn();
    const mutations = new MutationObserver(watchReservedTurn);
    mutations.observe(column, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [RESERVED_TURN_ATTRIBUTE],
    });

    const passive = { passive: true } as const;
    window.addEventListener('scroll', onScroll, passive);
    window.addEventListener('scrollend', finishJump, passive);
    window.addEventListener('resize', onWindowResize, passive);
    window.addEventListener('wheel', onInput, passive);
    window.addEventListener('touchstart', onInput, passive);
    window.addEventListener('mousedown', onInput, passive);
    // Bubbling, on the window: after React's handlers, so a menu's own
    // `preventDefault` is seen.
    window.addEventListener('keydown', onInput, passive);
    // Capture: the toggle's own handler re-renders before a bubbling
    // listener would hear of it.
    window.addEventListener('click', onToggle, true);
    window.addEventListener('keydown', onToggle, true);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('scrollend', finishJump);
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('wheel', onInput);
      window.removeEventListener('touchstart', onInput);
      window.removeEventListener('mousedown', onInput);
      window.removeEventListener('keydown', onInput);
      window.removeEventListener('click', onToggle, true);
      window.removeEventListener('keydown', onToggle, true);
      observer.disconnect();
      mutations.disconnect();
      // A jump under way outlives neither the page nor its column.
      clearTimeout(jumpTimer.current);
      jumpTimer.current = undefined;
    };
  }, [column, dock, apply, finishJump, markReaderChange]);

  return { hasNewBelow, jumpToBottom, openAtEnd, revealTurn, markReaderChange };
}
