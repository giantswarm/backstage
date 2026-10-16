import { FocusEvent, ReactNode, useId, useState } from 'react';
import { Button } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import { useContainerDimensions } from '../../hooks';

const useStyles = makeStyles({
  // `clip`, not `hidden`: the viewport is no scroll container, so neither
  // focus nor `scrollIntoView` can scroll the content inside the cut.
  viewport: {
    position: 'relative',
    overflow: 'clip',
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

/** The state of one collapsible region, shared by its viewport and toggle. */
export type CollapsibleState = {
  /** The content is taller than the collapsed height, so it has a toggle. */
  overflows: boolean;
  expanded: boolean;
  /** The content is cut right now. */
  collapsed: boolean;
  collapsedHeight: number;
  toggle: () => void;
  expand: () => void;
  /** Ties the toggle to the region it shows (`aria-controls`). */
  viewportId: string;
  /** Measures the content at the available width. */
  contentRef: (node: Element | null) => void;
};

/**
 * A region cut to `collapsedHeight` pixels until it is expanded. Split from
 * its pieces, {@link CollapsibleViewport} and {@link CollapsibleToggle}, so the
 * toggle can sit outside the box the content is cut in — under a chat bubble,
 * say. Content that fits is never cut and has no toggle. The expanded state
 * lives as long as the component that holds it.
 */
export function useCollapsible({
  collapsedHeight,
}: {
  collapsedHeight: number;
}): CollapsibleState {
  const viewportId = useId();
  const [expanded, setExpanded] = useState(false);
  // The inner element is never height-limited, so its height is the rendered
  // content's at the available width.
  const [contentRef, { height }] = useContainerDimensions();
  const overflows = height > collapsedHeight + 1;

  return {
    overflows,
    expanded,
    collapsed: overflows && !expanded,
    collapsedHeight,
    toggle: () => setExpanded(previous => !previous),
    expand: () => setExpanded(true),
    viewportId,
    contentRef,
  };
}

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
  const { collapsed, collapsedHeight, expand, viewportId, contentRef } = state;

  // Focus past the cut, from the keyboard or a `#heading` link, would land on
  // something hidden under the fade; show everything instead.
  const revealFocused = (event: FocusEvent<HTMLDivElement>) => {
    if (!collapsed) {
      return;
    }
    const offset =
      event.target.getBoundingClientRect().bottom -
      event.currentTarget.getBoundingClientRect().top;
    if (offset > collapsedHeight) {
      expand();
    }
  };

  return (
    <div
      id={viewportId}
      className={classes.viewport}
      style={collapsed ? { maxHeight: collapsedHeight } : undefined}
      onFocus={revealFocused}
    >
      <div ref={contentRef}>{children}</div>
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
