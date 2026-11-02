import {
  RefObject,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

/**
 * The most a cut may leave hidden before it simply shows everything: hiding
 * one line behind a fade and a button costs a click to save a line. A fifth
 * of the collapsed height, the rule `ShowMore` pages lists by
 * (`showMoreSlack`): two lines of a ten-line cut.
 */
export function collapseSlack(collapsedHeight: number): number {
  return collapsedHeight / 5;
}

export type UseCollapsibleOptions = {
  /**
   * How tall the content is while cut: pixels, or any CSS length, resolved in
   * the viewport's own type — `'10lh'` is ten lines of the text in it, at
   * whatever size the reader's browser sets.
   */
  collapsedHeight: number | string;
  /**
   * Whether it is shown whole, for a caller that keeps the state itself — so
   * it outlives the component, as a conversation's messages need when their
   * rows remount. Uncontrolled when absent.
   */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

/** The state of one collapsible region, shared by its viewport and toggle. */
export type CollapsibleState = {
  /** The content is taller than the cut by more than {@link collapseSlack}. */
  overflows: boolean;
  expanded: boolean;
  /** The content is cut right now. */
  collapsed: boolean;
  collapsedHeight: number | string;
  /** The collapsed height in pixels, as last laid out; 0 before layout. */
  collapsedPixels: number;
  toggle: () => void;
  /**
   * Shows everything because something inside the cut was asked for —
   * focus, find in page — keeping the content where it is on screen though
   * `scrolledBy` pixels of it had been scrolled up inside the cut.
   */
  reveal: (scrolledBy: number) => void;
  /** Ties the toggle to the region it shows (`aria-controls`). */
  viewportId: string;
  viewportRef: RefObject<HTMLDivElement>;
  /** An empty box exactly `collapsedHeight` tall, which resolves it to pixels. */
  limitRef: RefObject<HTMLDivElement>;
  /** The content, never height-limited, so its height is the whole of it. */
  contentRef: RefObject<HTMLDivElement>;
};

/** The element that scrolls `element` into and out of view. */
function scrollParentOf(element: Element): Element | null {
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const { overflowY } = getComputedStyle(parent);
    if (
      /auto|scroll|overlay/.test(overflowY) &&
      parent.scrollHeight > parent.clientHeight
    ) {
      return parent;
    }
  }
  return document.scrollingElement;
}

type AfterChange =
  { kind: 'collapse' } | { kind: 'reveal'; scrolledBy: number } | null;

/**
 * A region cut to `collapsedHeight` until it is expanded. Split from its
 * pieces, `CollapsibleViewport` and `CollapsibleToggle`, so the toggle can sit
 * outside the box the content is cut in — under a chat bubble, say.
 *
 * Content no taller than the cut plus {@link collapseSlack} is never cut and
 * has no toggle. It is measured before the first paint, so a long text does
 * not show whole for a frame and then shrink. Cutting it again brings it back
 * into view when it went above the top, rather than leaving the reader
 * wherever its end was.
 */
export function useCollapsible({
  collapsedHeight,
  expanded: controlledExpanded,
  onExpandedChange,
}: UseCollapsibleOptions): CollapsibleState {
  const viewportId = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const limitRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [ownExpanded, setOwnExpanded] = useState(false);
  const expanded = controlledExpanded ?? ownExpanded;
  const [size, setSize] = useState({ content: 0, limit: 0 });
  const afterChange = useRef<AfterChange>(null);

  // Before paint, then whenever the content or the cut changes size (a
  // narrower window, a larger font).
  useLayoutEffect(() => {
    const content = contentRef.current;
    const limit = limitRef.current;
    if (!content || !limit) {
      return undefined;
    }
    const measure = () => {
      const next = { content: content.offsetHeight, limit: limit.offsetHeight };
      setSize(previous =>
        previous.content === next.content && previous.limit === next.limit
          ? previous
          : next,
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    observer.observe(limit);
    return () => observer.disconnect();
  }, []);

  const overflows =
    size.limit > 0 && size.content - size.limit > collapseSlack(size.limit);

  const setExpanded = useCallback(
    (next: boolean) => {
      if (controlledExpanded === undefined) {
        setOwnExpanded(next);
      }
      onExpandedChange?.(next);
    },
    [controlledExpanded, onExpandedChange],
  );

  useLayoutEffect(() => {
    const change = afterChange.current;
    afterChange.current = null;
    const viewport = viewportRef.current;
    if (!change || !viewport) {
      return;
    }
    const scroller = scrollParentOf(viewport);
    if (change.kind === 'reveal') {
      // The content moves down by what was scrolled inside the cut; the page
      // moves with it, so what was asked for stays where it was.
      viewport.scrollTop = 0;
      if (scroller && change.scrolledBy > 0) {
        scroller.scrollTop += change.scrolledBy;
      }
      return;
    }
    const viewTop =
      !scroller || scroller === document.scrollingElement
        ? 0
        : scroller.getBoundingClientRect().top;
    if (viewport.getBoundingClientRect().top < viewTop) {
      // Centred, clear of a sticky header above and a docked composer below.
      viewport.scrollIntoView?.({ block: 'center' });
    }
  }, [expanded]);

  return {
    overflows,
    expanded,
    collapsed: overflows && !expanded,
    collapsedHeight,
    collapsedPixels: size.limit,
    toggle: () => {
      if (expanded) {
        afterChange.current = { kind: 'collapse' };
      }
      setExpanded(!expanded);
    },
    reveal: scrolledBy => {
      if (expanded) {
        return;
      }
      afterChange.current = { kind: 'reveal', scrolledBy };
      setExpanded(true);
    },
    viewportId,
    viewportRef,
    limitRef,
    contentRef,
  };
}
