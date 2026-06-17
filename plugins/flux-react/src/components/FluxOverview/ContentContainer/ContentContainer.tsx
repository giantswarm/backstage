import { ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles(theme => {
  const bodyBackgroundColor =
    theme.palette.type === 'light' ? '#f8f8f8' : '#333';

  return {
    root: {
      position: 'relative',
      // Cancel the Backstage Content (<article>) right and bottom padding so
      // the tree's scrollbar sits flush against the page edge and the tree
      // reaches the viewport bottom. Matches Content's paddingRight (spacing(2)
      // on xs, spacing(3) on sm+) and paddingBottom (spacing(3)).
      marginRight: theme.spacing(-2),
      marginBottom: theme.spacing(-3),
      [theme.breakpoints.up('sm')]: {
        marginRight: theme.spacing(-3),
      },

      '&::before': {
        content: '\"\"',
        position: 'absolute',
        zIndex: 1,
        left: 0,
        top: 0,
        right: theme.spacing(2),
        height: theme.spacing(0.5),
        background: `linear-gradient(to bottom, ${bodyBackgroundColor}, transparent)`,
      },

      '&::after': {
        content: '\"\"',
        position: 'absolute',
        zIndex: 1,
        left: 0,
        bottom: 0,
        right: theme.spacing(2),
        height: theme.spacing(0.5),
        background: `linear-gradient(to top, ${bodyBackgroundColor}, transparent)`,
      },
    },
    inner: {
      height: '100%',
    },
  };
});

type ContentContainerProps = {
  renderContent: (containerHeight: number) => ReactNode;
};

/**
 * Sizes the (virtualized) tree to fill the available vertical space.
 *
 * The app shell does not provide a flowed full-height container to inherit
 * from: the sidebar is `position: fixed` (sized against the viewport), while
 * the page content column is `position: static` and content-sized, so a
 * `height: 100%` / `flexGrow` chain collapses to the content height. We instead
 * anchor directly to the viewport: available height = viewport height minus the
 * container's top offset (everything rendered above it), re-measured on resize
 * and whenever content above reflows.
 */
export const ContentContainer = ({ renderContent }: ContentContainerProps) => {
  const classes = useStyles();
  const rootRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) {
      return undefined;
    }

    const measure = () => {
      const { top } = node.getBoundingClientRect();
      const next = Math.max(0, window.innerHeight - top);
      // Ignore sub-pixel jitter; this also keeps the body ResizeObserver below
      // from looping, since growing the tree never shifts its own top offset.
      setHeight(prev => (Math.abs(prev - next) > 1 ? next : prev));
    };

    measure();

    window.addEventListener('resize', measure);
    // Content above the tree (page header, filters, error banners) can reflow
    // and shift our top offset; re-measure when the document body resizes.
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(document.body);

    return () => {
      window.removeEventListener('resize', measure);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className={classes.root} ref={rootRef} style={{ height }}>
      <div className={classes.inner}>{renderContent(height)}</div>
    </div>
  );
};
