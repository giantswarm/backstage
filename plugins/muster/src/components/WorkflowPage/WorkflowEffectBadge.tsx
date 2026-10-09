import { Badge } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import type { ToolEffect } from '../../lib/toolAnnotations';
import { WORKFLOW_EFFECT_LABELS } from '../../lib/workflowDisplay';

const useStyles = makeStyles({
  changes: {
    background: 'var(--bui-warning-bg-subdued)',
    color: 'var(--bui-warning-fg-subdued)',
  },
});

export type WorkflowEffectBadgeProps = {
  effect: ToolEffect;
};

/**
 * The workflow's honest effect badge — "Only reads" / "Can change things" —
 * from the readOnlyHint muster derives for its `workflow_<name>` tool (the
 * hint is per-session, so callers read it off the tools endpoint, not the CR).
 * Same look as the shared `EffectBadge`, with workflow wording: "Only reads"
 * is a transitive guarantee over every tool the steps can reach.
 */
export function WorkflowEffectBadge({ effect }: WorkflowEffectBadgeProps) {
  const classes = useStyles();
  return (
    <Badge
      size="small"
      className={effect === 'changes' ? classes.changes : undefined}
    >
      {WORKFLOW_EFFECT_LABELS[effect]}
    </Badge>
  );
}
