import {
  TOOL_EFFECT_LABELS,
  type ToolEffect,
} from '../../../lib/toolAnnotations';
import { MarkerBadge, type MarkerBadgeProps } from '../MarkerBadge';

export type EffectBadgeProps = {
  effect: ToolEffect;
  /** `compact` where it rides the edge of a box: a step on the flow canvas. */
  size?: MarkerBadgeProps['size'];
};

/**
 * Whether a tool (or workflow) reads or changes things, as a small badge:
 * neutral for reads, warning-coloured for changes. The one renderer of an
 * effect — tool lists, workflow lists, the workflow flow and the approval card
 * all draw it, in the same words. Take the effect from `toolEffect` (a
 * workflow's from `workflowEffect`: muster marks a workflow read-only only
 * when every tool its steps can reach is, so its "Reads" holds for all of
 * them).
 */
export function EffectBadge({ effect, size }: EffectBadgeProps) {
  return (
    <MarkerBadge
      tone={effect === 'changes' ? 'warning' : 'neutral'}
      size={size}
    >
      {TOOL_EFFECT_LABELS[effect]}
    </MarkerBadge>
  );
}
