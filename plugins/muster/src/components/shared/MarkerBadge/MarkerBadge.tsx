import { ReactNode } from 'react';
import { Badge } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles({
  // bui's small badge sets its text in `--bui-font-size-1` (10px), too small
  // to read at a glance. The text size of bui's medium badge and tag
  // instead, at the small badge's height, so a marker still sits beside a
  // tool's name without growing its row. One line always: two lines of 12px
  // text do not fit the badge's fixed height.
  root: {
    fontSize: 'var(--bui-font-size-2)',
    whiteSpace: 'nowrap',
  },
  // A fill one neutral step above the surface, and an edge. bui steps a
  // badge's fill above a surface it knows (`data-on-bg`); without one it
  // takes `--bui-bg-neutral-1`, which is the page's own white in the agent
  // shell, so a neutral marker was text with no box. Only that case is
  // filled here, so bui's own stepping still applies on its surfaces.
  neutral: {
    boxShadow: 'inset 0 0 0 1px var(--bui-border-1)',
    '&:not([data-on-bg])': {
      background: 'var(--bui-bg-neutral-2)',
    },
  },
  warning: {
    background: 'var(--bui-warning-bg-subdued)',
    color: 'var(--bui-warning-fg-subdued)',
    boxShadow: 'inset 0 0 0 1px var(--bui-warning-border)',
  },
  // The size of a marker riding an edge: a workflow step's top edge on the
  // flow canvas and in its phone list.
  compact: {
    height: 18,
    padding: '0 6px',
  },
});

export type MarkerBadgeProps = {
  /** Neutral for a plain fact, warning for one a person should weigh. */
  tone: 'neutral' | 'warning';
  /**
   * `small`, bui's small badge, beside a name in a list; `compact` (18px
   * high) where the marker rides the edge of a box. Defaults to `small`.
   */
  size?: 'small' | 'compact';
  /** Extra class, e.g. a step number's round shape and position. */
  className?: string;
  children: ReactNode;
};

/**
 * A short marker on a tool or a workflow step — what it does, whether it may
 * fail, its number — as a small bui badge with a visible box in both tones
 * and themes. The look of every such marker, so a list, a step card and the
 * flow canvas cannot drift apart. For a tool's effect use
 * {@link EffectBadge}, which renders this.
 */
export function MarkerBadge({
  tone,
  size = 'small',
  className,
  children,
}: MarkerBadgeProps) {
  const classes = useStyles();
  return (
    <Badge
      size="small"
      className={[
        classes.root,
        classes[tone],
        size === 'compact' ? classes.compact : undefined,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </Badge>
  );
}
