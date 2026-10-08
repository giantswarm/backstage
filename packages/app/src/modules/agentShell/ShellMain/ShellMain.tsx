import { ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';

export const SHELL_CONTENT_ID = 'content';

const useStyles = makeStyles({
  root: {
    '&:focus': {
      outline: 'none',
    },
  },
});

/**
 * The shell's content region, the target of the rail's skip link. It is the
 * page's main landmark unless the page brings its own `<main>` (the
 * core-components `Page` does), so every page has exactly one. A role rather
 * than a `<main>` element: switching the element would remount the page.
 */
export function ShellMain({ children }: { children: ReactNode }) {
  const classes = useStyles();
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
    >
      {children}
    </div>
  );
}
