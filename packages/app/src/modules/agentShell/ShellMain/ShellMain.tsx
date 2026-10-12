import {
  type CSSProperties,
  ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useSidebarPinState } from '@backstage/core-components';
import { makeStyles } from '@material-ui/core/styles';
import { useContentOffset, useRailWidth } from '../RailWidthProvider';
import { useKeyboardTapHold } from './keyboardTapHold';

export const SHELL_CONTENT_ID = 'content';

const useStyles = makeStyles({
  // The region starts where the rail ends: SidebarPage's padding plus this
  // offset (`useContentOffset`). Print drops both.
  root: {
    marginLeft: 'var(--agent-shell-content-offset, 0px)',
    '&:focus': {
      outline: 'none',
    },
    '@media print': {
      marginLeft: 0,
    },
  },
  // Collapsing or expanding the rail eases the offset as SidebarPage eases
  // its padding (same duration and curve), so the edge moves as one. A
  // resize, by drag or by key, follows the rail's edge at once instead.
  pinChange: {
    transition: 'margin-left 0.1s ease-out',
  },
});

/**
 * Whether the latest change to the content's edge was the rail collapsing or
 * expanding, rather than a resize. Kept until the next change of either, so
 * an unrelated render does not cut an easing short.
 */
function useEasesPinChange(): boolean {
  const { isPinned } = useSidebarPinState();
  const { width } = useRailWidth();
  const last = useRef({ isPinned, width, eases: false });
  let eases = last.current.eases;
  if (isPinned !== last.current.isPinned) {
    eases = true;
  } else if (width !== last.current.width) {
    eases = false;
  }
  useEffect(() => {
    last.current = { isPinned, width, eases };
  });
  return eases;
}

/**
 * The shell's content region, the target of the rail's skip link. It is the
 * page's main landmark unless the page brings its own `<main>` (the
 * core-components `Page` does), so every page has exactly one. A role rather
 * than a `<main>` element: switching the element would remount the page.
 * Mounted once per shell, it also holds the phone's keyboard layout while a
 * tap is in progress (`useKeyboardTapHold`).
 *
 * Its left edge is the rail's width, expanded (and resizable) or collapsed,
 * from `useRailInset`, the same value the rail is drawn at: SidebarPage pads
 * the page by the classic sidebar's width, as on classic pages, and the
 * region moves by the difference. Right from its first frame, with nothing
 * that depends on the browser matching a parent selector.
 */
export function ShellMain({ children }: { children: ReactNode }) {
  const classes = useStyles();
  useKeyboardTapHold();
  const offset = useContentOffset();
  const easesPinChange = useEasesPinChange();
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
      className={`${classes.root} ${easesPinChange ? classes.pinChange : ''}`}
      style={{ '--agent-shell-content-offset': `${offset}px` } as CSSProperties}
    >
      {children}
    </div>
  );
}
