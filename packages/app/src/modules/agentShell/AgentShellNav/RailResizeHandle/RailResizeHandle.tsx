import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { TOUCH_MEDIA } from '@giantswarm/backstage-plugin-ui-react';
import { useRailWidth } from '../../RailWidthProvider';

/** How far one arrow key press moves the edge; with Shift, four times as far. */
export const RAIL_RESIZE_STEP = 16;

/** The grab area's width for a pointer, centred on the rail's border. */
const HIT_WIDTH = 8;
/**
 * Under touch, wider for a finger, yet clear of both sides' controls: the
 * rail's right padding (8px, where its rows end) and its 1px border, plus
 * one pixel of the page, so it takes no taps meant for a row, the pin or
 * the page.
 */
const TOUCH_HIT_WIDTH = 10;

const useStyles = makeStyles({
  // Invisible at rest, so the rail's border is the only line there; the
  // marker over the border shows where the edge can be grabbed, while it is
  // held and while the handle has keyboard focus. Above the rail (z-index
  // 1000) so the half over the rail can be grabbed too.
  handle: {
    position: 'fixed',
    top: 0,
    bottom: 0,
    zIndex: 1001,
    width: HIT_WIDTH,
    marginLeft: -HIT_WIDTH / 2,
    cursor: 'col-resize',
    touchAction: 'none',
    outline: 'none',
    '&::after': {
      content: '""',
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: '50%',
      width: 2,
      marginLeft: -1,
      background: 'var(--agent-shell-rail-item-active-bar, var(--bui-ring))',
      opacity: 0,
      transition: 'opacity 100ms ease-out',
    },
    // The delay keeps a pointer passing over the edge from flashing it.
    '&:hover::after': {
      opacity: 1,
      transitionDelay: '200ms',
    },
    '&:focus-visible::after': {
      opacity: 1,
    },
    [TOUCH_MEDIA]: {
      width: TOUCH_HIT_WIDTH,
      marginLeft: 1 - TOUCH_HIT_WIDTH,
      '&::after': {
        left: 'auto',
        right: 0,
        marginLeft: 0,
      },
    },
  },
  dragging: {
    '&::after, &:hover::after': {
      opacity: 1,
      transitionDelay: '0ms',
    },
  },
});

/**
 * The expanded rail's right edge as a window splitter (WAI-ARIA's separator
 * pattern): drag it, or focus it and press the arrow keys, Home (narrowest)
 * or End (widest). A double click returns the default width. The rail's
 * width lives in `RailWidthProvider`, so the content beside it follows.
 *
 * A drag previews the width at most once a frame and sets (and remembers) it
 * on release; only the rail's frame and the content's edge re-render meanwhile.
 */
export function RailResizeHandle({ controls }: { controls: string }) {
  const classes = useStyles();
  const { width, minWidth, maxWidth, previewWidth, setWidth, resetWidth } =
    useRailWidth();
  const drag = useRef<{
    startX: number;
    startWidth: number;
    /** The width the latest move asks for; none until the pointer moves. */
    next?: number;
    frame?: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  // A rail collapsed or unmounted mid-drag must not leave its preview behind.
  // Through a ref, so the cleanup runs on unmount only, not whenever the
  // window's bounds give `previewWidth` a new identity.
  const endPreview = useRef(previewWidth);
  endPreview.current = previewWidth;
  useEffect(
    () => () => {
      if (drag.current?.frame !== undefined) {
        cancelAnimationFrame(drag.current.frame);
      }
      if (drag.current) {
        endPreview.current(undefined);
      }
    },
    [],
  );

  // Text under the pointer must not get selected while the edge moves.
  useEffect(() => {
    if (!dragging) {
      return undefined;
    }
    const userSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.userSelect = userSelect;
    };
  }, [dragging]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width };
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) {
      return;
    }
    current.next = current.startWidth + event.clientX - current.startX;
    if (current.frame === undefined) {
      current.frame = requestAnimationFrame(() => {
        current.frame = undefined;
        previewWidth(current.next);
      });
    }
  };
  // Up, cancel and lost capture all end it; the first one to arrive sets the
  // width, the rest find no drag.
  const endDrag = () => {
    const current = drag.current;
    if (!current) {
      return;
    }
    drag.current = null;
    if (current.frame !== undefined) {
      cancelAnimationFrame(current.frame);
    }
    setDragging(false);
    if (current.next !== undefined) {
      setWidth(current.next);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? RAIL_RESIZE_STEP * 4 : RAIL_RESIZE_STEP;
    const next: Record<string, number> = {
      ArrowLeft: width - step,
      ArrowRight: width + step,
      Home: minWidth,
      End: maxWidth,
    };
    if (event.key in next) {
      event.preventDefault();
      setWidth(next[event.key]);
    }
  };

  // A focusable separator is a widget in WAI-ARIA (the window splitter),
  // which jsx-a11y's role tables do not know.
  /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-controls={controls}
      aria-valuenow={width}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      tabIndex={0}
      className={`${classes.handle} ${dragging ? classes.dragging : ''}`}
      style={{ left: width }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={resetWidth}
    />
  );
  /* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
}
