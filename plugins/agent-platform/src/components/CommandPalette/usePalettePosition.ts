import {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import useLocalStorageState from 'use-local-storage-state';

/**
 * Where the person last put the palette, per browser: the same `gs-` prefix
 * as the plugin's other remembered UI state (`useLastUsedAgent`). Per browser
 * rather than per person, because a place on the screen belongs to a screen.
 */
export const PALETTE_POSITION_STORAGE_KEY = 'gs-agent-platform-search-position';

/** The least room the palette keeps from the window's edges. */
export const PALETTE_EDGE = 8;

/** The palette's top-left corner, in window pixels. */
export type PalettePosition = { x: number; y: number };

type Size = { width: number; height: number };

function isPosition(value: unknown): value is PalettePosition {
  const position = value as PalettePosition | undefined;
  return (
    typeof position?.x === 'number' &&
    typeof position?.y === 'number' &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y)
  );
}

/**
 * `position`, moved as little as it takes to keep a box of `size` inside
 * `viewport`, {@link PALETTE_EDGE} from its edges. A box larger than the
 * window keeps its top-left corner in view.
 */
export function clampPalettePosition(
  position: PalettePosition,
  size: Size,
  viewport: Size,
): PalettePosition {
  const clamp = (value: number, length: number, room: number) =>
    Math.max(PALETTE_EDGE, Math.min(value, room - length - PALETTE_EDGE));
  return {
    x: clamp(position.x, size.width, viewport.width),
    y: clamp(position.y, size.height, viewport.height),
  };
}

function windowSize(): Size {
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * The palette's place on the screen (issue #39049, finding 4): it can be
 * dragged by its header, so a running session stays in view beside it.
 * Unmoved, it sits where the dialog puts it, in the middle; moved, it keeps
 * its top-left corner, so it grows downwards as results arrive instead of
 * both ways. The place is remembered per browser and kept inside the window
 * whatever the window's size. A double-click on the header puts it back in
 * the middle.
 *
 * Off while `enabled` is false: at phone width the palette is the screen.
 */
export function usePalettePosition(enabled: boolean) {
  const [stored, setStored, { removeItem }] = useLocalStorageState<unknown>(
    PALETTE_POSITION_STORAGE_KEY,
    { defaultValue: undefined },
  );
  const [dragged, setDragged] = useState<PalettePosition>();
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [viewport, setViewport] = useState<Size>(windowSize);
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerX: number;
    pointerY: number;
    origin: PalettePosition;
    last?: PalettePosition;
  }>();

  const position = dragged ?? (isPosition(stored) ? stored : undefined);
  const isPlaced = enabled && !!position;

  // The size, measured before paint so a remembered place is clamped in the
  // first frame, and again whenever results change it.
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!isPlaced || !element) {
      return undefined;
    }
    const measure = () => {
      const { offsetWidth: width, offsetHeight: height } = element;
      setSize(previous =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isPlaced]);

  useLayoutEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const onResize = () => setViewport(windowSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [enabled]);

  const placed =
    isPlaced && position
      ? clampPalettePosition(position, size, viewport)
      : undefined;

  const style: CSSProperties | undefined = placed
    ? { position: 'fixed', left: placed.x, top: placed.y, margin: 0 }
    : undefined;

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const element = containerRef.current;
      if (!enabled || !element || event.button !== 0) {
        return;
      }
      // The header's close button is pressed, not dragged.
      if ((event.target as Element).closest('button, a, input')) {
        return;
      }
      const rect = element.getBoundingClientRect();
      drag.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        origin: { x: rect.left, y: rect.top },
      };
      setSize({ width: rect.width, height: rect.height });
      event.currentTarget.setPointerCapture?.(event.pointerId);
      // No text selection while dragging, and focus stays in the field.
      event.preventDefault();
    },
    [enabled],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const current = drag.current;
      if (!current) {
        return;
      }
      const next = clampPalettePosition(
        {
          x: current.origin.x + event.clientX - current.pointerX,
          y: current.origin.y + event.clientY - current.pointerY,
        },
        size,
        windowSize(),
      );
      current.last = next;
      setDragged(next);
    },
    [size],
  );

  const endDrag = useCallback(() => {
    const current = drag.current;
    drag.current = undefined;
    if (current?.last) {
      setStored(current.last);
    }
    setDragged(undefined);
  }, [setStored]);

  const onDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (!enabled || (event.target as Element).closest('button, a, input')) {
        return;
      }
      removeItem();
    },
    [enabled, removeItem],
  );

  return {
    containerRef,
    /** For the dialog's container: its place, when it has been moved. */
    style,
    /** Whether a drag is under way. */
    isDragging: dragged !== undefined,
    /** For the header the palette is dragged by; none while not enabled. */
    handleProps: enabled
      ? {
          onPointerDown,
          onPointerMove,
          onPointerUp: endDrag,
          onPointerCancel: endDrag,
          onDoubleClick,
        }
      : {},
  };
}
