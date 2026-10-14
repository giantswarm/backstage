import { Badge } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import {
  TOOL_EFFECT_LABELS,
  type ToolEffect,
} from '../../../lib/toolAnnotations';
import { WORKFLOW_EFFECT_LABELS } from '../../../lib/workflowDisplay';

const useStyles = makeStyles({
  changes: {
    background: 'var(--bui-warning-bg-subdued)',
    color: 'var(--bui-warning-fg-subdued)',
  },
});

export type EffectBadgeProps = {
  effect: ToolEffect;
  /**
   * Whose effect: a tool's ("Reads" / "Changes things"), or a workflow's
   * derived one, worded as the guarantee it is ("Only reads" / "Can change
   * things": muster marks a workflow read-only only when every tool its steps
   * can reach is). Defaults to a tool.
   */
  subject?: 'tool' | 'workflow';
};

/**
 * Whether a tool (or workflow) only reads or changes things, as a small
 * badge: neutral for reads, warning-coloured for changes. The one renderer of
 * an effect — tool lists, workflow lists and the approval card all draw it.
 * Take the effect from `toolEffect` (a workflow's from `workflowEffect`).
 */
export function EffectBadge({ effect, subject = 'tool' }: EffectBadgeProps) {
  const classes = useStyles();
  const labels =
    subject === 'workflow' ? WORKFLOW_EFFECT_LABELS : TOOL_EFFECT_LABELS;
  return (
    <Badge
      size="small"
      className={effect === 'changes' ? classes.changes : undefined}
    >
      {labels[effect]}
    </Badge>
  );
}
