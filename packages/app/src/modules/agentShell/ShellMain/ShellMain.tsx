import {
  type CSSProperties,
  ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { sidebarConfig, useSidebarPinState } from '@backstage/core-components';
import { makeStyles } from '@material-ui/core/styles';
import { useRailWidth } from '../railWidth';
import { useKeyboardTapHold } from './keyboardTapHold';

export const SHELL_CONTENT_ID = 'content';

const useStyles = makeStyles({
  root: {
    marginLeft: 'var(--agent-shell-rail-offset, 0px)',
    '&:focus': {
      outline: 'none',
    },
    // SidebarPage drops its rail padding for print; so does the offset.
    '@media print': {
      marginLeft: 0,
    },
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
 * SidebarPage pads the page by the default rail width; a rail the person
 * resized (`useRailWidth`) moves the region's left edge by the difference.
 */
export function ShellMain({ children }: { children: ReactNode }) {
  const classes = useStyles();
  useKeyboardTapHold();
  const { isPinned, isMobile } = useSidebarPinState();
  const { width: railWidth } = useRailWidth();
  const railOffset =
    isPinned && !isMobile ? railWidth - sidebarConfig.drawerWidthOpen : 0;
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
      className={classes.root}
      style={
        railOffset
          ? ({
              '--agent-shell-rail-offset': `${railOffset}px`,
            } as CSSProperties)
          : undefined
      }
    >
      {children}
    </div>
  );
}
