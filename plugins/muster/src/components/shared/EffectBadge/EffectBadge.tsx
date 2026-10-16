import {
  TOOL_EFFECT_LABELS,
  type ToolEffect,
} from '../../../lib/toolAnnotations';
import { WORKFLOW_EFFECT_LABELS } from '../../../lib/workflowDisplay';
import { MarkerBadge } from '../MarkerBadge';

export type EffectBadgeProps = {
  effect: ToolEffect;
  /**
   * Whose effect: a tool's ("Reads" / "Changes things"), or a workflow's
   * derived one, worded as the guarantee it is ("Only reads" / "Can change
   * things": muster marks a workflow read-only only when every tool its steps
   * can reach is). Defaults to a tool.
   */
  subject?: 'tool' | 'workflow';
  /** Extra class, e.g. the flow canvas's compact size for its edge markers. */
  className?: string;
};

/**
 * Whether a tool (or workflow) only reads or changes things, as a small
 * badge: neutral for reads, warning-coloured for changes. The one renderer of
 * an effect — tool lists, workflow lists, the workflow flow and the approval
 * card all draw it. Take the effect from `toolEffect` (a workflow's from
 * `workflowEffect`).
 */
export function EffectBadge({
  effect,
  subject = 'tool',
  className,
}: EffectBadgeProps) {
  const labels =
    subject === 'workflow' ? WORKFLOW_EFFECT_LABELS : TOOL_EFFECT_LABELS;
  return (
    <MarkerBadge
      tone={effect === 'changes' ? 'warning' : 'neutral'}
      className={className}
    >
      {labels[effect]}
    </MarkerBadge>
  );
}
