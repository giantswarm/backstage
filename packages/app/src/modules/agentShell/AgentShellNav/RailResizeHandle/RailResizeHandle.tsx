import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { TOUCH_MEDIA } from '@giantswarm/backstage-plugin-ui-react';
import { useRailWidth } from '../../railWidth';

/** How far one arrow key press moves the edge; with Shift, four times as far. */
export const RAIL_RESIZE_STEP = 16;

/** The grab area's width, centred on the rail's border; wider under touch. */
const HIT_WIDTH = 8;
const TOUCH_HIT_WIDTH = 20;

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
      marginLeft: -TOUCH_HIT_WIDTH / 2,
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
 */
export function RailResizeHandle({ controls }: { controls: string }) {
  const classes = useStyles();
  const { width, minWidth, maxWidth, setWidth, resetWidth } = useRailWidth();
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const [dragging, setDragging] = useState(false);

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
    if (drag.current) {
      setWidth(drag.current.startWidth + event.clientX - drag.current.startX);
    }
  };
  const endDrag = () => {
    drag.current = null;
    setDragging(false);
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
