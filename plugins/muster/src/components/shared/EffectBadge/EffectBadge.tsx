import { VisuallyHidden } from '@backstage/ui';
import { Eye, Zap } from 'lucide-react';
import {
  TOOL_EFFECT_HINTS,
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
  const hint = TOOL_EFFECT_HINTS[effect];
  // An icon is a property mark (an eye, a bolt), never a pencil: that is the
  // edit-state marker's. None on the compact flow-canvas badge.
  const Icon = effect === 'changes' ? Zap : Eye;
  const icon = size === 'compact' ? undefined : <Icon aria-hidden />;
  return (
    <span title={hint}>
      <MarkerBadge
        tone={effect === 'changes' ? 'warning' : 'neutral'}
        size={size}
        icon={icon}
      >
        {TOOL_EFFECT_LABELS[effect]}
        <VisuallyHidden>{`: ${hint}`}</VisuallyHidden>
      </MarkerBadge>
    </span>
  );
}
