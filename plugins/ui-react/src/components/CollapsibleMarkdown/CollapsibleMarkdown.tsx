import { FocusEvent, useId, useState } from 'react';
import { Button, Flex } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import { GSMarkdownContent } from '../GSMarkdownContent';
import { useContainerDimensions } from '../../hooks';

const DEFAULT_COLLAPSED_HEIGHT = 250;

const useStyles = makeStyles({
  viewport: {
    position: 'relative',
    overflow: 'hidden',
  },
  // The same fade bui's own scroll areas use: from the surface the component
  // sits on to transparent, so it matches any card or page background.
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

export type CollapsibleMarkdownProps = {
  content: string;
  toggleLabels: { expand: string; collapse: string };
  /** Height in pixels the content is cut to while collapsed. */
  collapsedHeight?: number;
};

/**
 * Markdown cut to a fixed height with a fade, and a toggle to show all of it.
 * Content that fits is shown whole, without a toggle.
 */
export const CollapsibleMarkdown = ({
  content,
  toggleLabels,
  collapsedHeight = DEFAULT_COLLAPSED_HEIGHT,
}: CollapsibleMarkdownProps) => {
  const classes = useStyles();
  const contentId = useId();
  const [expanded, setExpanded] = useState(false);
  // The inner element is never height-limited, so its height is the rendered
  // markdown's at the available width.
  const [contentRef, { height }] = useContainerDimensions();
  const overflows = height > collapsedHeight + 1;
  const collapsed = overflows && !expanded;

  // Keyboard focus on a link past the cut would land on something hidden under
  // the fade; show everything instead. The browser may already have scrolled
  // the clipped viewport to the link, so its offset adds `scrollTop` back.
  const revealFocused = (event: FocusEvent<HTMLDivElement>) => {
    if (!collapsed) {
      return;
    }
    const viewport = event.currentTarget;
    const offset =
      event.target.getBoundingClientRect().bottom -
      viewport.getBoundingClientRect().top +
      viewport.scrollTop;
    if (offset > collapsedHeight) {
      viewport.scrollTop = 0;
      setExpanded(true);
    }
  };

  return (
    <Flex direction="column" gap="2">
      <div
        id={contentId}
        className={classes.viewport}
        style={collapsed ? { maxHeight: collapsedHeight } : undefined}
        onFocus={revealFocused}
      >
        <div ref={contentRef}>
          <GSMarkdownContent content={content} />
        </div>
        {collapsed && <div className={classes.fade} />}
      </div>
      {overflows && (
        <Flex justify="center">
          <Button
            variant="tertiary"
            size="small"
            aria-expanded={expanded}
            aria-controls={contentId}
            onPress={() => setExpanded(previous => !previous)}
          >
            {expanded ? toggleLabels.collapse : toggleLabels.expand}
          </Button>
        </Flex>
      )}
    </Flex>
  );
};
