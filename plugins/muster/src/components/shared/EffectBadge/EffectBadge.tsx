import { Badge } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import type { ToolEffect } from '../../../lib/toolAnnotations';

const useStyles = makeStyles({
  changes: {
    background: 'var(--bui-warning-bg-subdued)',
    color: 'var(--bui-warning-fg-subdued)',
  },
});

const EFFECT_LABELS: Record<ToolEffect, string> = {
  reads: 'Reads',
  changes: 'Changes things',
};

export type EffectBadgeProps = {
  effect: ToolEffect;
};

/**
 * Whether a tool only reads or changes things, as a small badge: neutral for
 * reads, warning-coloured for changes. Take the effect from `toolEffect`.
 */
export function EffectBadge({ effect }: EffectBadgeProps) {
  const classes = useStyles();
  return (
    <Badge
      size="small"
      className={effect === 'changes' ? classes.changes : undefined}
    >
      {EFFECT_LABELS[effect]}
    </Badge>
  );
}
