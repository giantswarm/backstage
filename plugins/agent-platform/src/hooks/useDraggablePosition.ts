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

/** The least room a dragged box keeps from the window's edges. */
export const DRAGGABLE_EDGE = 8;

/** A box's top-left corner, in window pixels. */
export type DraggablePosition = { x: number; y: number };

type Size = { width: number; height: number };

function isPosition(value: unknown): value is DraggablePosition {
  const position = value as DraggablePosition | undefined;
  return (
    typeof position?.x === 'number' &&
    typeof position?.y === 'number' &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y)
  );
}

/**
 * `position`, moved as little as it takes to keep a box of `size` inside
 * `viewport`, {@link DRAGGABLE_EDGE} from its edges. A box larger than the
 * window keeps its top-left corner in view.
 */
export function clampDraggablePosition(
  position: DraggablePosition,
  size: Size,
  viewport: Size,
): DraggablePosition {
  const clamp = (value: number, length: number, room: number) =>
    Math.max(DRAGGABLE_EDGE, Math.min(value, room - length - DRAGGABLE_EDGE));
  return {
    x: clamp(position.x, size.width, viewport.width),
    y: clamp(position.y, size.height, viewport.height),
  };
}

function windowSize(): Size {
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Whether a press lands on a control inside the handle, not the handle. */
function onControl(target: EventTarget): boolean {
  return (
    target instanceof Element && !!target.closest('button, a, input, select')
  );
}

/**
 * A fixed box (a dialog) the person can drag by a handle (its header) to
 * anywhere in the window. Unmoved, it sits where its layout puts it; moved,
 * it keeps its top-left corner, so it grows downwards as its content grows
 * instead of both ways. The place is remembered per browser under
 * `storageKey` (a place on the screen belongs to a screen, not to a person
 * across devices) and kept inside the window whatever the window's size. A
 * double-click on the handle puts it back where its layout puts it.
 *
 * The box is measured with its offsets, not its bounding rectangle: those
 * ignore transforms, so a press during an opening scale animation does not
 * start the drag from a shrunken box.
 *
 * Off while `enabled` is false: no handle, and a remembered place is
 * ignored.
 */
export function useDraggablePosition(storageKey: string, enabled: boolean) {
  const [stored, setStored, { removeItem }] = useLocalStorageState<unknown>(
    storageKey,
    { defaultValue: undefined },
  );
  const [dragged, setDragged] = useState<DraggablePosition>();
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [viewport, setViewport] = useState<Size>(windowSize);
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerX: number;
    pointerY: number;
    origin: DraggablePosition;
    last?: DraggablePosition;
  }>();

  const position = dragged ?? (isPosition(stored) ? stored : undefined);
  const isPlaced = enabled && !!position;

  // The size, measured before paint so a remembered place is clamped in the
  // first frame, and again whenever the content changes it.
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
      ? clampDraggablePosition(position, size, viewport)
      : undefined;

  const style: CSSProperties | undefined = placed
    ? { position: 'fixed', left: placed.x, top: placed.y, margin: 0 }
    : undefined;

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const element = containerRef.current;
      if (!element || event.button !== 0 || onControl(event.target)) {
        return;
      }
      // Where the box is now: its place once moved; unmoved, its offset in
      // the fixed overlay that lays it out, which starts at the window's
      // top-left corner.
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      drag.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        origin: placed ?? { x: element.offsetLeft, y: element.offsetTop },
      };
      setSize({ width, height });
      event.currentTarget.setPointerCapture?.(event.pointerId);
      // No text selection while dragging.
      event.preventDefault();
    },
    [placed],
  );

  // Focus stays where it is (the dialog's field). Cancelling `pointerdown`
  // does not cancel the focus change of the mouse press in every browser;
  // cancelling `mousedown` does (react-aria's `usePress` does the same).
  const onMouseDown = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (event.button === 0 && !onControl(event.target)) {
      event.preventDefault();
    }
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const current = drag.current;
      if (!current) {
        return;
      }
      const next = clampDraggablePosition(
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
      if (!onControl(event.target)) {
        removeItem();
      }
    },
    [removeItem],
  );

  return {
    containerRef,
    /** For the box: its place, once it has been moved. */
    style,
    /** Whether a drag is under way. */
    isDragging: dragged !== undefined,
    /** For the handle the box is dragged by; none while not enabled. */
    handleProps: enabled
      ? {
          onPointerDown,
          onMouseDown,
          onPointerMove,
          onPointerUp: endDrag,
          onPointerCancel: endDrag,
          onDoubleClick,
        }
      : {},
  };
}
