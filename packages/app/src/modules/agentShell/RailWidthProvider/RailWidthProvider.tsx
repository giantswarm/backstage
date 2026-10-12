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
  /** While a drag previews a width that is not set yet. */
  resizing: boolean;
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
  resizing: false,
  previewWidth: () => {},
  setWidth: () => {},
  resetWidth: () => {},
});

/**
 * Holds the expanded rail's width for the rail, its resize handle and the
 * content region beside it. The remembered width is kept as chosen; a window
 * too narrow for it shows the widest it allows, and the chosen width returns
 * once the window is wide enough again.
 */
export function RailWidthProvider({ children }: { children: ReactNode }) {
  const [preferred, setPreferred] = useState(readStoredWidth);
  const [preview, setPreview] = useState<number>();
  const [maxWidth, setMaxWidth] = useState(() =>
    maxWidthFor(window.innerWidth),
  );

  useEffect(() => {
    const update = () => setMaxWidth(maxWidthFor(window.innerWidth));
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Once per set width, never per frame of a drag: a preview does not reach
  // `preferred`.
  useEffect(() => {
    storeWidth(preferred);
  }, [preferred]);

  const previewWidth = useCallback(
    (width: number | undefined) =>
      setPreview(width === undefined ? undefined : clamp(width, maxWidth)),
    [maxWidth],
  );
  const setWidth = useCallback(
    (width: number) => {
      const next = clamp(width, maxWidth);
      setPreview(undefined);
      setPreferred(current =>
        next === clamp(current, maxWidth) ? current : next,
      );
    },
    [maxWidth],
  );
  const resetWidth = useCallback(() => {
    setPreview(undefined);
    setPreferred(RAIL_DEFAULT_WIDTH);
  }, []);

  const value = useMemo(
    () => ({
      width: preview ?? clamp(preferred, maxWidth),
      minWidth: RAIL_MIN_WIDTH,
      maxWidth,
      resizing: preview !== undefined,
      previewWidth,
      setWidth,
      resetWidth,
    }),
    [preferred, preview, maxWidth, previewWidth, setWidth, resetWidth],
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
  return isPinned ? width : sidebarConfig.drawerWidthClosed;
}
