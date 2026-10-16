import { FocusEvent, ReactNode, UIEvent } from 'react';
import { Button } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import type { CollapsibleState } from '../../hooks';

const useStyles = makeStyles({
  // `hidden`, which only a script, focus or find in page can scroll: any of
  // them scrolling the cut is how the viewport learns that something inside
  // it was asked for, and shows everything.
  viewport: {
    position: 'relative',
    overflow: 'hidden',
  },
  // Out of scroll anchoring, so the browser does not hold the page on a line
  // that moves inside the cut while it opens or closes; the hook places it.
  content: {
    overflowAnchor: 'none',
  },
  limit: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 0,
    visibility: 'hidden',
    pointerEvents: 'none',
    overflowAnchor: 'none',
  },
  // The same fade bui's own scroll areas use: from the surface the content
  // sits on to transparent, so it matches any card or page background. A
  // surface bui does not paint sets `--bui-bg-inherit` to its own fill.
  fade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    background:
      'linear-gradient(to top, var(--bui-bg-inherit), rgb(from var(--bui-bg-inherit) r g b / 0))',
    pointerEvents: 'none',
  },
});

export type CollapsibleViewportProps = {
  state: CollapsibleState;
  children: ReactNode;
};

/** The box the content is cut in, with a fade over the cut while it is. */
export function CollapsibleViewport({
  state,
  children,
}: CollapsibleViewportProps) {
  const classes = useStyles();
  const {
    collapsed,
    collapsedHeight,
    collapsedPixels,
    reveal,
    viewportId,
    viewportRef,
    limitRef,
    contentRef,
  } = state;

  // Focus past the cut, from the keyboard or a `#heading` link, would land on
  // something hidden under the fade; show everything instead.
  const revealFocused = (event: FocusEvent<HTMLDivElement>) => {
    if (!collapsed) {
      return;
    }
    const viewport = event.currentTarget;
    const offset =
      event.target.getBoundingClientRect().bottom -
      viewport.getBoundingClientRect().top;
    if (offset > collapsedPixels || viewport.scrollTop > 0) {
      reveal(viewport.scrollTop);
    }
  };

  // Find in page scrolls a match under the cut into the box; nothing else
  // scrolls a box a person cannot scroll.
  const revealScrolled = (event: UIEvent<HTMLDivElement>) => {
    if (collapsed && event.currentTarget.scrollTop > 0) {
      reveal(event.currentTarget.scrollTop);
    }
  };

  return (
    <div
      ref={viewportRef}
      id={viewportId}
      className={classes.viewport}
      style={collapsed ? { maxHeight: collapsedHeight } : undefined}
      onFocus={revealFocused}
      onScroll={revealScrolled}
    >
      <div
        ref={limitRef}
        aria-hidden
        className={classes.limit}
        style={{ height: collapsedHeight }}
        data-collapsible-limit=""
      />
      <div
        ref={contentRef}
        className={classes.content}
        data-collapsible-content=""
      >
        {children}
      </div>
      {collapsed && <div className={classes.fade} />}
    </div>
  );
}

export type CollapsibleToggleProps = {
  state: CollapsibleState;
  labels: { expand: string; collapse: string };
};

/** Shows or cuts the content again; nothing when the content fits. */
export function CollapsibleToggle({ state, labels }: CollapsibleToggleProps) {
  if (!state.overflows) {
    return null;
  }
  return (
    <Button
      variant="tertiary"
      size="small"
      aria-expanded={state.expanded}
      aria-controls={state.viewportId}
      onPress={state.toggle}
    >
      {state.expanded ? labels.collapse : labels.expand}
    </Button>
  );
}
