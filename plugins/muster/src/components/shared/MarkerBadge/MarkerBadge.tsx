import { ReactNode } from 'react';
import { Badge } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles({
  // bui's small badge sets its text in `--bui-font-size-1` (10px), too small
  // to read at a glance. The text size of bui's medium badge and tag
  // instead, at the small badge's height, so a marker still sits beside a
  // tool's name without growing its row.
  root: {
    fontSize: 'var(--bui-font-size-2)',
  },
  // A fill one neutral step above the surface, and an edge: bui's badge sits
  // on `--bui-bg-neutral-1`, which is the page's own white in the agent
  // shell, so without them a neutral marker was text with no box.
  neutral: {
    background: 'var(--bui-bg-neutral-2)',
    boxShadow: 'inset 0 0 0 1px var(--bui-border-1)',
  },
  warning: {
    background: 'var(--bui-warning-bg-subdued)',
    color: 'var(--bui-warning-fg-subdued)',
    boxShadow: 'inset 0 0 0 1px var(--bui-warning-border)',
  },
});

export type MarkerBadgeProps = {
  /** Neutral for a plain fact, warning for one a person should weigh. */
  tone: 'neutral' | 'warning';
  /** Extra class, e.g. a compact size where the marker rides an edge. */
  className?: string;
  children: ReactNode;
};

/**
 * A short marker on a tool or a workflow step — what it does, whether it may
 * fail — as a small bui badge with a visible box in both tones and themes.
 * The look of every such marker, so a list, a step card and the flow canvas
 * cannot drift apart. For a tool's effect use {@link EffectBadge}, which
 * renders this.
 */
export function MarkerBadge({ tone, className, children }: MarkerBadgeProps) {
  const classes = useStyles();
  return (
    <Badge
      size="small"
      className={[classes.root, classes[tone], className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </Badge>
  );
}
