import {
  type CSSProperties,
  ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { useRailInset, useRailWidth } from '../RailWidthProvider';
import { useKeyboardTapHold } from './keyboardTapHold';

export const SHELL_CONTENT_ID = 'content';

const useStyles = makeStyles({
  // The region starts where the rail ends (the layout lifts SidebarPage's
  // own padding in the shell), easing as SidebarPage's padding did when the
  // rail collapses or expands.
  root: {
    marginLeft: 'var(--agent-shell-rail-inset, 0px)',
    transition: 'margin-left 0.1s ease-out',
    '&:focus': {
      outline: 'none',
    },
    '@media print': {
      marginLeft: 0,
    },
  },
  // A drag moves the edge under the pointer, so nothing eases behind it.
  resizing: {
    transition: 'none',
  },
});

/**
 * The shell's content region, the target of the rail's skip link. It is the
 * page's main landmark unless the page brings its own `<main>` (the
 * core-components `Page` does), so every page has exactly one. A role rather
 * than a `<main>` element: switching the element would remount the page.
 * Mounted once per shell, it also holds the phone's keyboard layout while a
 * tap is in progress (`useKeyboardTapHold`).
 *
 * Its left edge is the rail's width, expanded (and resizable) or collapsed,
 * from `useRailInset`: the same value the rail is drawn at.
 */
export function ShellMain({ children }: { children: ReactNode }) {
  const classes = useStyles();
  useKeyboardTapHold();
  const railInset = useRailInset();
  const { resizing } = useRailWidth();
  const ref = useRef<HTMLDivElement>(null);
  const [hasOwnMain, setHasOwnMain] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return undefined;
    }
    const update = () => setHasOwnMain(element.querySelector('main') !== null);
    update();
    const observer = new MutationObserver(update);
    observer.observe(element, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      id={SHELL_CONTENT_ID}
      tabIndex={-1}
      role={hasOwnMain ? undefined : 'main'}
      className={`${classes.root} ${resizing ? classes.resizing : ''}`}
      style={{ '--agent-shell-rail-inset': `${railInset}px` } as CSSProperties}
    >
      {children}
    </div>
  );
}
