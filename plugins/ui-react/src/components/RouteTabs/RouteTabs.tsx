import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Tab, TabList, Tabs } from '@backstage/ui';
import {
  RoutingProvider,
  useRoutingIntegration,
  type RoutingIntegration,
} from '@backstage/frontend-plugin-api/routing';
import { makeStyles } from '@material-ui/core';
import { useSplatBasePath } from '../../hooks/useSplatBasePath';
import ChevronLeftIcon from '@material-ui/icons/ChevronLeft';
import ChevronRightIcon from '@material-ui/icons/ChevronRight';
import {
  FINE_POINTER_QUERY,
  PHONE_MEDIA,
  useMediaQueryMatch,
} from '../../utils/breakpoints';

/** A tab's count, or `'loading'` while the page is still reading it. */
export type RouteTabCount = number | 'loading';

export interface RouteTabSpec {
  id: string;
  /** The tab's path segment below the page; empty for the page's index. */
  path: string;
  title: string;
  /**
   * Shown after the title, as `Tools (10)`. `'loading'` draws a skeleton in
   * its place, as wide as a two-digit count, so the tab has its final width
   * before the count arrives. Absent is not zero: the tab has no count, or it
   * could not be read.
   */
  count?: RouteTabCount;
}

export interface RouteTabsProps {
  tabs: RouteTabSpec[];
  /** The query string every tab link keeps, e.g. `?installation=gazelle`. */
  search?: string;
  /**
   * The page's own path, the tab hrefs' base. Defaults to the splat route's
   * base path; pass it when the page's address is itself part of the splat
   * (a skill addressed as `<owner>/<repo>/<nested dir>`), where the route
   * cannot tell the page's segments from the tab's.
   */
  basePath?: string;
  /**
   * On the strip, the tabs' scroll container — e.g. to bleed it at phone width
   * into the page gutter, so the tabs scroll to the screen's edge.
   */
  className?: string;
  /**
   * Called instead of switching tabs, with the switch to make: a page that
   * must ask first (a run in flight) calls `navigate` once the person agrees,
   * and other pages leave it out. The strip's links navigate on press through
   * react-aria's router, not on click, so this is the one place to hold them.
   */
  onNavigate?: (href: string, navigate: () => void) => void;
}

/** How wide the fade at a strip edge with more tabs beyond it is. */
const EDGE_FADE = '24px';
const FADE_IN = `transparent, #000 ${EDGE_FADE}`;
const FADE_OUT = `#000 calc(100% - ${EDGE_FADE}), transparent`;

function edgeMask(start: boolean, end: boolean) {
  const stops = [start ? FADE_IN : '#000', end ? FADE_OUT : '#000'].join(', ');
  const mask = `linear-gradient(to right, ${stops})`;
  return { WebkitMaskImage: mask, maskImage: mask };
}

/** Phone's shortest touch target, in px (WCAG 2.5.5, Apple's HIG). */
const TOUCH_TARGET = 44;

/** How many digits a count's slot holds before its tab grows. */
const RESERVED_DIGITS = 2;
/** The widest count the slot holds, as drawn: `(00)`. */
const RESERVED_COUNT = `(${'0'.repeat(RESERVED_DIGITS)})`;

const useStyles = makeStyles({
  // Holds the strip and, with a mouse, the scroll buttons over its edges.
  frame: {
    position: 'relative',
  },
  // A mouse's way to the cut-off tabs (a vertical wheel doesn't scroll a row
  // sideways): a round button over the edge that has more tabs beyond it,
  // on the page's background so the faded tab under it doesn't show through.
  scrollButton: {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 1,
    width: 28,
    height: 28,
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--bui-border-1)',
    borderRadius: '50%',
    background: 'var(--bui-bg-app, var(--bui-bg-neutral-1))',
    color: 'var(--bui-fg-secondary)',
    cursor: 'pointer',
    '&:hover': {
      background: 'var(--bui-bg-neutral-2)',
      color: 'var(--bui-fg-primary)',
    },
    '& svg': { width: 18, height: 18 },
  },
  scrollButtonStart: { left: 0 },
  scrollButtonEnd: { right: 0 },
  // The strip scrolls sideways at every width where its tabs don't fit — a
  // phone, and a narrow window beside the shell's rail — and lays out as
  // bui's strip where they do.
  strip: {
    overflowX: 'auto',
    overflowY: 'hidden',
    overscrollBehaviorX: 'contain',
    // The edge fades say there is more; a scrollbar under a tab row is noise.
    scrollbarWidth: 'none',
    '&::-webkit-scrollbar': { display: 'none' },
    // bui hangs the active underline 1px below the tabs, onto the rule under
    // the strip. A scroll container clips it, so the strip keeps a 1px row
    // for it and pulls that row back over the rule.
    paddingBottom: 1,
    marginBottom: -1,
    '&[data-overflow-start]': edgeMask(true, false),
    '&[data-overflow-end]': edgeMask(false, true),
    '&[data-overflow-start][data-overflow-end]': edgeMask(true, true),
    // bui's root, the box it measures the underline against: as wide as its
    // tabs, so it scrolls with them (see `RouteTabs`).
    '& > .bui-Tabs': {
      width: 'max-content',
      minWidth: '100%',
    },
    '& .bui-TabList': {
      flexWrap: 'nowrap',
    },
    '& .bui-Tab': {
      flexShrink: 0,
      whiteSpace: 'nowrap',
      // The strip clips overflow on both axes: draw the focus ring inside.
      '&:focus-visible': { outlineOffset: -2 },
    },
    [PHONE_MEDIA]: {
      '& .bui-Tab': {
        height: TOUCH_TARGET,
        minWidth: TOUCH_TARGET,
      },
    },
  },
  // A count's slot, at every width: at least as wide as `RESERVED_COUNT`, so
  // a count up to 99 arriving moves no tab. A hidden `(00)` and the count (or
  // its skeleton) share one grid cell, and tabular figures make every
  // two-digit count exactly that wide. Generated content, so the label's text
  // and its accessible name stay `Tools (10)`.
  count: {
    display: 'inline-grid',
    fontVariantNumeric: 'tabular-nums',
    '&::before': {
      // An empty alternative text keeps it out of the accessible name where
      // `visibility` alone would not; the fallback for browsers without it.
      fallbacks: { content: `"${RESERVED_COUNT}"` },
      content: `"${RESERVED_COUNT}" / ""`,
      gridArea: '1 / 1',
      visibility: 'hidden',
    },
    '& > *': { gridArea: '1 / 1' },
  },
  // bui's `Skeleton` drawn on a `span`: bui's renders a `div`, which may not
  // sit in a tab's link. Its tokens, so it looks and pulses as the rest.
  countSkeleton: {
    alignSelf: 'center',
    height: '1em',
    backgroundColor: 'var(--bui-bg-neutral-2)',
    borderRadius: 'var(--bui-radius-2)',
    animation: 'var(--bui-animate-pulse)',
  },
});

function hrefPathname(href: string) {
  return href.split('?')[0].split('#')[0];
}

/**
 * The index of the tab the URL selects — bui's own rule, repeated so the strip
 * knows which tab to scroll to before bui's selection settles: the index
 * matches exactly, other tabs by prefix, and the longest match wins.
 */
function selectedRouteTab(
  tabs: Array<{ path: string; href: string }>,
  pathname: string,
): number {
  let selected = -1;
  let maxSegments = -1;
  tabs.forEach((tab, index) => {
    const tabPath = hrefPathname(tab.href);
    const isActive =
      tabPath === pathname ||
      (tab.path !== '' && pathname.startsWith(`${tabPath}/`));
    const segments = tabPath.split('/').filter(Boolean).length;
    if (isActive && segments > maxSegments) {
      selected = index;
      maxSegments = segments;
    }
  });
  return selected;
}

type Overflow = { start: boolean; end: boolean };
const NO_OVERFLOW: Overflow = { start: false, end: false };

/** A pixel of slack: zoom and subpixel layout leave fractions. */
const SLACK = 1;

/**
 * The strip's scrolling, in one place: whether it has tabs scrolled off
 * before and after its visible part (live, on scroll and on any resize), and
 * the selected tab scrolled to the middle of the strip (clamped at its ends),
 * so both neighbours show. Only the strip scrolls, never the page.
 *
 * The selected tab is scrolled into view when the tabs first arrive (at
 * once), and then, smoothly unless the user asked for reduced motion:
 *
 * - when the selection changes;
 * - when the strip goes from fitting its tabs to overflowing (a window
 *   narrowed, a tab appearing);
 * - when the tabs' own width changes while the strip overflows (a count
 *   arriving, a label drawn a commit late, a web font), unless the person
 *   has scrolled the strip by hand since: their scroll is kept.
 *
 * A resize of the strip alone (a window dragged, the rail folding) re-centres
 * nothing.
 */
function useStripScroll(ref: RefObject<HTMLElement>, selected: number) {
  const [overflow, setOverflow] = useState(NO_OVERFLOW);
  const reduceMotion = useMediaQueryMatch('(prefers-reduced-motion: reduce)');
  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  /** Re-centres the selected tab; set while the strip is mounted. */
  const centreRef = useRef<() => void>(() => {});
  /** Set by a scroll the person made: wheel, touch, a press, a key. */
  const scrolledByHand = useRef(false);

  useEffect(() => {
    const strip = ref.current;
    if (!strip) {
      setOverflow(NO_OVERFLOW);
      return undefined;
    }
    let hasCentred = false;
    let wasOverflowing = false;
    let lastTabsWidth = 0;

    const tabsOf = () =>
      Array.from(strip.querySelectorAll<HTMLElement>('[role="tab"]'));
    const centre = () => {
      const tab = tabsOf()[selectedRef.current];
      if (!tab) {
        return;
      }
      const stripRect = strip.getBoundingClientRect();
      const tabRect = tab.getBoundingClientRect();
      // Clamped to the strip's scroll range: where the tabs fit, 0.
      const max = Math.max(0, strip.scrollWidth - strip.clientWidth);
      const left = Math.min(
        max,
        Math.max(
          0,
          strip.scrollLeft +
            (tabRect.left - stripRect.left) -
            (strip.clientWidth - tabRect.width) / 2,
        ),
      );
      const behavior: ScrollBehavior =
        hasCentred && !reduceMotionRef.current ? 'smooth' : 'auto';
      hasCentred = true;
      if (typeof strip.scrollTo === 'function') {
        strip.scrollTo({ left, behavior });
      } else {
        strip.scrollLeft = left;
      }
    };
    centreRef.current = centre;

    const updateEdges = () => {
      const max = strip.scrollWidth - strip.clientWidth;
      const start = strip.scrollLeft > SLACK;
      const end = strip.scrollLeft < max - SLACK;
      setOverflow(previous =>
        previous.start === start && previous.end === end
          ? previous
          : { start, end },
      );
    };
    const measure = () => {
      const tabs = tabsOf();
      if (tabs.length === 0) {
        updateEdges();
        return;
      }
      const overflowing = strip.scrollWidth - strip.clientWidth > SLACK;
      // The tabs' own width, from the first tab's left edge to the last one's
      // right: unlike the tab list's box, which is at least as wide as the
      // strip, it doesn't follow the strip's width.
      const tabsWidth =
        tabs[tabs.length - 1].getBoundingClientRect().right -
        tabs[0].getBoundingClientRect().left;
      if (
        !hasCentred ||
        (overflowing && !wasOverflowing) ||
        (overflowing &&
          Math.abs(tabsWidth - lastTabsWidth) > SLACK &&
          !scrolledByHand.current)
      ) {
        centre();
      }
      wasOverflowing = overflowing;
      lastTabsWidth = tabsWidth;
      updateEdges();
    };

    const markScrolledByHand = () => {
      scrolledByHand.current = true;
    };
    const handEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    for (const type of handEvents) {
      strip.addEventListener(type, markScrolledByHand, { passive: true });
    }
    strip.addEventListener('scroll', updateEdges, { passive: true });

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(measure);
    resizeObserver?.observe(strip);
    // The tab list is as wide as its tabs once they overflow. react-aria
    // draws it a commit after the strip mounts, and may replace it: observe
    // whichever one is there.
    let observedTabList: Element | null = null;
    const observeTabList = () => {
      const tabList = strip.querySelector('.bui-TabList');
      if (tabList !== observedTabList) {
        if (observedTabList) {
          resizeObserver?.unobserve(observedTabList);
        }
        if (tabList) {
          resizeObserver?.observe(tabList);
        }
        observedTabList = tabList;
      }
      measure();
    };
    const mutationObserver = new MutationObserver(observeTabList);
    mutationObserver.observe(strip, { childList: true, subtree: true });
    observeTabList();

    return () => {
      centreRef.current = () => {};
      for (const type of handEvents) {
        strip.removeEventListener(type, markScrolledByHand);
      }
      strip.removeEventListener('scroll', updateEdges);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
    };
  }, [ref]);

  // A new selection: scroll to it, and forget the hand scroll before it.
  const previousSelected = useRef(selected);
  useEffect(() => {
    if (previousSelected.current === selected) {
      return;
    }
    previousSelected.current = selected;
    scrolledByHand.current = false;
    centreRef.current();
  }, [selected]);

  /** Scrolls the strip by most of its width, for the scroll buttons. */
  const scrollByPage = useCallback(
    (direction: -1 | 1) => {
      const strip = ref.current;
      if (!strip) {
        return;
      }
      scrolledByHand.current = true;
      const left = direction * strip.clientWidth * 0.75;
      const behavior: ScrollBehavior = reduceMotionRef.current
        ? 'auto'
        : 'smooth';
      if (typeof strip.scrollBy === 'function') {
        strip.scrollBy({ left, behavior });
      } else {
        strip.scrollLeft += left;
      }
    },
    [ref],
  );

  return { overflow, scrollByPage };
}

function renderTabLabel(
  tab: RouteTabSpec,
  classes: ReturnType<typeof useStyles>,
) {
  if (tab.count === undefined) {
    return tab.title;
  }
  const loading = tab.count === 'loading';
  // One inline box: bui's tab is a flex container, which would trim the space
  // off a bare title before the count.
  return (
    <span>
      {tab.title}{' '}
      <span
        className={classes.count}
        data-count={loading ? 'loading' : undefined}
      >
        {loading ? (
          // Out of the accessible name: the tab reads "Tools" until its
          // count arrives, then "Tools (10)".
          <span aria-hidden className={classes.countSkeleton} />
        ) : (
          <span>({tab.count})</span>
        )}
      </span>
    </span>
  );
}

/**
 * The routing integration around the strip, its navigations held for
 * `onNavigate`. The hook keeps one identity for the strip's lifetime, as
 * `RoutingProvider` asks, and reads the latest guard and integration.
 */
function useGuardedRoutingIntegration(
  onNavigate: RouteTabsProps['onNavigate'],
): () => RoutingIntegration {
  const outer = useRoutingIntegration();
  const latest = useRef({ outer, onNavigate });
  latest.current = { outer, onNavigate };
  const [useGuarded] = useState(() => (): RoutingIntegration => ({
    createHref: to => latest.current.outer.createHref(to),
    get pathname() {
      return latest.current.outer.pathname;
    },
    navigate: (to, options) => {
      const { outer: integration, onNavigate: guard } = latest.current;
      const go = () => integration.navigate(to, options);
      if (guard) {
        guard(to, go);
      } else {
        go();
      }
    },
  }));
  return useGuarded;
}

/**
 * A page's tab strip whose tabs are routes: navigation links whose active state
 * follows the URL, the content drawn by the page's own `<Routes>`. Mounted
 * inside the page's splat route (`<Route path=":name/*">`), so the links are
 * built from its base path.
 *
 * Three traps it handles: the id is not the path (bui draws no underline for an
 * empty selected key), hrefs are absolute (a relative one appends inside a splat
 * route), and the index matches exactly (its href is a prefix of every other
 * tab's).
 *
 * A tab with a count keeps its width as the count arrives: a skeleton holds a
 * two-digit count's place while it loads (`count: 'loading'`), and a count up
 * to 99 fits that place, so the tabs right of it never move under a pointer.
 *
 * Where its tabs don't fit, the strip scrolls sideways instead of wrapping or
 * squeezing (Customize has seven tabs with counts): one row of tabs (44px tall
 * at phone width), the selected one scrolled into view (`useStripScroll`), a
 * fade at each edge that has more tabs beyond it and, with a mouse, a button
 * over that edge that scrolls the strip. The underline stays right under
 * scroll without re-measuring: bui places
 * it at the selected tab's offset from its `Tabs` root, both read from screen
 * coordinates, and the scroll container here sits *outside* that root, which
 * is as wide as its tabs — tab and root move together, so the offset holds.
 * (Scrolling bui's own `TabList` instead would leave the underline behind at
 * the offset measured before the scroll.)
 */
export function RouteTabs({
  tabs,
  search = '',
  basePath: explicitBasePath,
  className,
  onNavigate,
}: RouteTabsProps) {
  const classes = useStyles();
  const splatBasePath = useSplatBasePath();
  const basePath = explicitBasePath ?? splatBasePath;
  const { pathname } = useLocation();
  const stripRef = useRef<HTMLDivElement>(null);

  const links = tabs.map(tab => ({
    ...tab,
    href: `${tab.path ? `${basePath}/${tab.path}` : basePath}${search}`,
  }));
  const selected = selectedRouteTab(links, pathname);
  const { overflow, scrollByPage } = useStripScroll(stripRef, selected);
  const finePointer = useMediaQueryMatch(FINE_POINTER_QUERY);
  const useGuardedRouting = useGuardedRoutingIntegration(onNavigate);

  const strip = (
    <Tabs>
      <TabList>
        {links.map(tab => (
          <Tab
            key={tab.id}
            id={tab.id}
            href={tab.href}
            matchStrategy={tab.path ? 'prefix' : 'exact'}
          >
            {renderTabLabel(tab, classes)}
          </Tab>
        ))}
      </TabList>
    </Tabs>
  );

  // For a mouse only, and out of the tab order and the accessibility tree:
  // a keyboard moves along the tabs with the arrow keys, which scrolls them
  // into view, and a touch screen swipes.
  const scrollButton = (direction: -1 | 1) => (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      className={`${classes.scrollButton} ${
        direction < 0 ? classes.scrollButtonStart : classes.scrollButtonEnd
      }`}
      data-scroll-tabs={direction < 0 ? 'start' : 'end'}
      onClick={() => scrollByPage(direction)}
    >
      {direction < 0 ? <ChevronLeftIcon /> : <ChevronRightIcon />}
    </button>
  );

  return (
    <div className={classes.frame}>
      <div
        ref={stripRef}
        className={[classes.strip, className].filter(Boolean).join(' ')}
        data-overflow-start={overflow.start || undefined}
        data-overflow-end={overflow.end || undefined}
      >
        {onNavigate ? (
          // bui's tabs navigate through the closest routing integration: this
          // strip's presses go through the page's guard, the rest of the app
          // keeps the app's.
          <RoutingProvider useRoutingIntegration={useGuardedRouting}>
            {strip}
          </RoutingProvider>
        ) : (
          strip
        )}
      </div>
      {finePointer && overflow.start && scrollButton(-1)}
      {finePointer && overflow.end && scrollButton(1)}
    </div>
  );
}
