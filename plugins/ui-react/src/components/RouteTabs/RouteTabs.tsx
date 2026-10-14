import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { useHref, useLocation, useNavigate } from 'react-router-dom';
import { Tab, TabList, Tabs } from '@backstage/ui';
import { RouterProvider } from 'react-aria-components';
import { makeStyles } from '@material-ui/core';
import { useSplatBasePath } from '../../hooks/useSplatBasePath';
import {
  PHONE_MEDIA,
  useMediaQueryMatch,
  usePhoneLayout,
} from '../../utils/breakpoints';

export interface RouteTabSpec {
  id: string;
  /** The tab's path segment below the page; empty for the page's index. */
  path: string;
  title: string;
  /** Shown after the title, as `Tools (10)`; absent is not zero. */
  count?: number;
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
   * On the strip, the tabs' scroll container at phone width — e.g. to bleed it
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

const useStyles = makeStyles({
  // Desktop: no rules at all, the strip is bui's.
  strip: {
    [PHONE_MEDIA]: {
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
        height: TOUCH_TARGET,
        minWidth: TOUCH_TARGET,
        // The strip clips overflow on both axes: draw the focus ring inside.
        '&:focus-visible': { outlineOffset: -2 },
      },
    },
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

/**
 * Whether the strip has tabs scrolled off before and after its visible part,
 * live: on scroll, and when the strip or its tabs change size (a rotation, a
 * count arriving).
 */
function useOverflow(ref: RefObject<HTMLElement>, enabled: boolean): Overflow {
  const [overflow, setOverflow] = useState(NO_OVERFLOW);

  useEffect(() => {
    const strip = ref.current;
    if (!enabled || !strip) {
      setOverflow(NO_OVERFLOW);
      return undefined;
    }
    const update = () => {
      const max = strip.scrollWidth - strip.clientWidth;
      // A pixel of slack: zoom and subpixel layout leave fractions.
      const start = strip.scrollLeft > 1;
      const end = strip.scrollLeft < max - 1;
      setOverflow(previous =>
        previous.start === start && previous.end === end
          ? previous
          : { start, end },
      );
    };
    strip.addEventListener('scroll', update, { passive: true });
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(update);
    resizeObserver?.observe(strip);
    // The tab list grows with its labels (counts arriving), but react-aria
    // draws it a commit after the strip mounts: watch for it.
    let observedTabList: Element | null = null;
    const observeTabList = () => {
      const tabList = strip.querySelector('.bui-TabList');
      if (tabList && tabList !== observedTabList) {
        if (observedTabList) {
          resizeObserver?.unobserve(observedTabList);
        }
        resizeObserver?.observe(tabList);
        observedTabList = tabList;
      }
      update();
    };
    const mutationObserver = new MutationObserver(observeTabList);
    mutationObserver.observe(strip, { childList: true, subtree: true });
    observeTabList();
    return () => {
      strip.removeEventListener('scroll', update);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
    };
  }, [ref, enabled]);

  return overflow;
}

/**
 * Scrolls the selected tab to the middle of the strip (clamped at its ends),
 * so both neighbours show: when the strip mounts — at once — and when the
 * selection changes or its labels do (counts arriving) — smoothly, unless the
 * user asked for reduced motion. Only the strip scrolls, never the page.
 */
function useSelectedTabInView(
  ref: RefObject<HTMLElement>,
  selected: number,
  labels: string,
  enabled: boolean,
) {
  const reduceMotion = useMediaQueryMatch('(prefers-reduced-motion: reduce)');
  const hasScrolled = useRef(false);

  useEffect(() => {
    const strip = ref.current;
    if (!enabled || !strip) {
      hasScrolled.current = false;
      return undefined;
    }
    const scrollToTab = (): boolean => {
      const tab = strip.querySelectorAll<HTMLElement>('[role="tab"]')[selected];
      if (!tab) {
        return false;
      }
      const stripRect = strip.getBoundingClientRect();
      const tabRect = tab.getBoundingClientRect();
      const left = Math.max(
        0,
        strip.scrollLeft +
          (tabRect.left - stripRect.left) -
          (strip.clientWidth - tabRect.width) / 2,
      );
      const behavior: ScrollBehavior =
        hasScrolled.current && !reduceMotion ? 'smooth' : 'auto';
      hasScrolled.current = true;
      if (typeof strip.scrollTo === 'function') {
        strip.scrollTo({ left, behavior });
      } else {
        strip.scrollLeft = left;
      }
      return true;
    };
    if (scrollToTab() || selected < 0) {
      return undefined;
    }
    // react-aria draws the tabs a commit after the strip mounts, once it has
    // built their collection: scroll when they arrive.
    const observer = new MutationObserver(() => {
      if (scrollToTab()) {
        observer.disconnect();
      }
    });
    observer.observe(strip, { childList: true, subtree: true });
    return () => observer.disconnect();
    // `reduceMotion` only picks the next scroll's behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, selected, labels, enabled]);
}

function tabLabel(tab: RouteTabSpec) {
  return tab.count === undefined ? tab.title : `${tab.title} (${tab.count})`;
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
 * At phone width the strip scrolls sideways instead of wrapping or squeezing
 * (Customize has six tabs with counts): one row of 44px-tall tabs, the selected
 * one scrolled into view, and a fade at each edge that has more tabs beyond
 * it. The underline stays right under scroll without re-measuring: bui places
 * it at the selected tab's offset from its `Tabs` root, both read from screen
 * coordinates, and the scroll container here sits *outside* that root, which
 * is as wide as its tabs — tab and root move together, so the offset holds.
 * (Scrolling bui's own `TabList` instead would leave the underline behind at
 * the offset measured before the scroll.) Desktop is bui's strip unchanged.
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
  const isPhone = usePhoneLayout();
  const stripRef = useRef<HTMLDivElement>(null);

  const links = tabs.map(tab => ({
    ...tab,
    href: `${tab.path ? `${basePath}/${tab.path}` : basePath}${search}`,
  }));
  const selected = selectedRouteTab(links, pathname);
  const overflow = useOverflow(stripRef, isPhone);
  const routerNavigate = useNavigate();
  // A tab carries no router options, so this is bui's own navigation for it.
  const guardedNavigate = useCallback(
    (href: string) => {
      if (onNavigate) {
        onNavigate(href, () => routerNavigate(href));
      } else {
        routerNavigate(href);
      }
    },
    [onNavigate, routerNavigate],
  );
  useSelectedTabInView(
    stripRef,
    selected,
    tabs.map(tabLabel).join('\n'),
    isPhone,
  );

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
            {tabLabel(tab)}
          </Tab>
        ))}
      </TabList>
    </Tabs>
  );

  return (
    <div
      ref={stripRef}
      className={[classes.strip, className].filter(Boolean).join(' ')}
      data-overflow-start={overflow.start || undefined}
      data-overflow-end={overflow.end || undefined}
    >
      {onNavigate ? (
        // The closest router provider wins: this strip's presses go through
        // the page's guard, the rest of the app keeps bui's.
        <RouterProvider navigate={guardedNavigate} useHref={useHref}>
          {strip}
        </RouterProvider>
      ) : (
        strip
      )}
    </div>
  );
}
