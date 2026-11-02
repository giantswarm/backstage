import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { sidebarConfig, useSidebarPinState } from '@backstage/core-components';

/**
 * The expanded rail's default width: core-components' pinned sidebar width.
 * Also the narrowest the rail goes, because it is what the rail's header
 * (logo, name and collapse button) was laid out for; narrower is the
 * collapsed rail.
 */
export const RAIL_DEFAULT_WIDTH = sidebarConfig.drawerWidthOpen;
export const RAIL_MIN_WIDTH = RAIL_DEFAULT_WIDTH;
/** The widest the rail goes, however wide the window. */
export const RAIL_MAX_WIDTH = 480;
/** Nor more than this share of the window, so the page keeps its room. */
const RAIL_MAX_SHARE = 0.4;

/**
 * The collapsed rail's width: one icon item, the rail's padding either side
 * and its 1px border. The parts are the tokens the rail is drawn with, in px:
 * the item is MUI's small icon (`fontSize="small"`, 20px) in RailLink's
 * `--bui-space-2` padding, and the rail's own padding is `px="2"`, also
 * `--bui-space-2` (8px while bui's `--bui-space` is 0.25rem; a test checks
 * it). Narrower than core-components' collapsed sidebar (72), which is laid
 * out for its own items; with the same padding on both sides every icon
 * centres on one axis.
 */
const RAIL_ICON_SIZE = 20;
const RAIL_SPACE_2 = 8;
export const RAIL_COLLAPSED_WIDTH =
  RAIL_ICON_SIZE + 2 * RAIL_SPACE_2 + 2 * RAIL_SPACE_2 + 1;

/**
 * Per browser, as core-components keeps the rail's pinned state: the width
 * that suits a screen is not the one that suits another.
 */
export const RAIL_WIDTH_STORAGE_KEY = 'agentShell.railWidth';

function maxWidthFor(windowWidth: number): number {
  return Math.max(
    RAIL_MIN_WIDTH,
    Math.min(RAIL_MAX_WIDTH, Math.floor(windowWidth * RAIL_MAX_SHARE)),
  );
}

function clamp(width: number, max: number): number {
  return Math.round(Math.max(RAIL_MIN_WIDTH, Math.min(width, max)));
}

function readStoredWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(RAIL_WIDTH_STORAGE_KEY));
    if (Number.isFinite(stored) && stored >= RAIL_MIN_WIDTH) {
      return stored;
    }
  } catch {
    // Storage blocked: the default width, unremembered.
  }
  return RAIL_DEFAULT_WIDTH;
}

function storeWidth(width: number) {
  try {
    if (width === RAIL_DEFAULT_WIDTH) {
      window.localStorage.removeItem(RAIL_WIDTH_STORAGE_KEY);
    } else {
      window.localStorage.setItem(RAIL_WIDTH_STORAGE_KEY, String(width));
    }
  } catch {
    // Storage blocked: the width holds until the page reloads.
  }
}

type RailWidth = {
  /** The expanded rail's width in px as shown, within the window's bounds. */
  width: number;
  minWidth: number;
  maxWidth: number;
  /**
   * Shows a width without setting or remembering it, for a drag in
   * progress; `undefined` ends the preview.
   */
  previewWidth: (width: number | undefined) => void;
  /**
   * Sets and remembers the width, clamped to the bounds, and ends a preview.
   * A width that leaves the rail as it was shown is not remembered, so a
   * press on the edge in a narrow window keeps a wider remembered width.
   */
  setWidth: (width: number) => void;
  /** Back to the default width. */
  resetWidth: () => void;
};

const RailWidthContext = createContext<RailWidth>({
  width: RAIL_DEFAULT_WIDTH,
  minWidth: RAIL_MIN_WIDTH,
  maxWidth: RAIL_MIN_WIDTH,
  previewWidth: () => {},
  setWidth: () => {},
  resetWidth: () => {},
});

/**
 * Holds the expanded rail's width for the rail, its resize handle and the
 * content region beside it. The remembered width is kept as chosen; a window
 * too narrow for it shows the widest it allows, and the chosen width returns
 * once the window is wide enough again.
 *
 * Mounted on every page by the layout, because a provider that came and went
 * with the shell would remount the page on each move between the two; off
 * the shell (`active` false) it does no work: no storage read, no window
 * listener. Storage is written only when the width really changes.
 */
export function RailWidthProvider({
  active = true,
  children,
}: {
  active?: boolean;
  children: ReactNode;
}) {
  // Read once the shell first renders, during that render, so its first
  // frame already has the remembered width.
  const [preferred, setPreferred] = useState(() =>
    active ? readStoredWidth() : undefined,
  );
  if (active && preferred === undefined) {
    setPreferred(readStoredWidth());
  }
  const [preview, setPreview] = useState<number>();
  // Re-renders on a window resize; the bound itself is read in render, so it
  // is current even after the window changed while the shell was not shown.
  const [, setWindowWidth] = useState(0);
  const maxWidth = maxWidthFor(window.innerWidth);

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const update = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [active]);

  const current = preferred ?? RAIL_DEFAULT_WIDTH;
  const previewWidth = useCallback(
    (width: number | undefined) =>
      setPreview(width === undefined ? undefined : clamp(width, maxWidth)),
    [maxWidth],
  );
  // Once per set width, never per frame of a drag: a preview is not stored.
  const setWidth = useCallback(
    (width: number) => {
      const next = clamp(width, maxWidth);
      setPreview(undefined);
      if (next !== clamp(current, maxWidth)) {
        setPreferred(next);
        storeWidth(next);
      }
    },
    [current, maxWidth],
  );
  const resetWidth = useCallback(() => {
    setPreview(undefined);
    if (current !== RAIL_DEFAULT_WIDTH) {
      setPreferred(RAIL_DEFAULT_WIDTH);
      storeWidth(RAIL_DEFAULT_WIDTH);
    }
  }, [current]);

  const value = useMemo(
    () => ({
      width: preview ?? clamp(current, maxWidth),
      minWidth: RAIL_MIN_WIDTH,
      maxWidth,
      previewWidth,
      setWidth,
      resetWidth,
    }),
    [current, preview, maxWidth, previewWidth, setWidth, resetWidth],
  );
  return (
    <RailWidthContext.Provider value={value}>
      {children}
    </RailWidthContext.Provider>
  );
}

export function useRailWidth(): RailWidth {
  return useContext(RailWidthContext);
}

/**
 * How much of the viewport's left edge the rail covers: the expanded rail's
 * width while pinned, the collapsed rail's otherwise, nothing at phone width
 * (the rail is the bottom bar there). The one definition the rail's width and
 * the content region's left edge both read.
 */
export function useRailInset(): number {
  const { isPinned, isMobile } = useSidebarPinState();
  const { width } = useRailWidth();
  if (isMobile) {
    return 0;
  }
  return isPinned ? width : RAIL_COLLAPSED_WIDTH;
}

/**
 * How far SidebarPage pads the page from the left, as core-components' Page
 * does it: the classic sidebar's width, pinned or collapsed, and nothing at
 * phone width. The shell keeps that padding, the same on classic pages and
 * in the shell, so moving between the two changes nothing it animates.
 */
function sidebarPagePadding(isPinned: boolean, isMobile?: boolean): number {
  if (isMobile) {
    return 0;
  }
  return isPinned
    ? sidebarConfig.drawerWidthOpen
    : sidebarConfig.drawerWidthClosed;
}

/**
 * How far the content region moves from where SidebarPage's padding puts
 * it, so that it starts where the rail ends: the rail's inset less the
 * padding. Negative for the collapsed rail, which is narrower than the
 * classic collapsed sidebar; positive for a rail widened past the default.
 */
export function useContentOffset(): number {
  const { isPinned, isMobile } = useSidebarPinState();
  return useRailInset() - sidebarPagePadding(isPinned, isMobile);
}
