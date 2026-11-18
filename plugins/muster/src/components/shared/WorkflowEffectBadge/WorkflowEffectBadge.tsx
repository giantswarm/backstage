import { HintTooltip } from '@giantswarm/backstage-plugin-ui-react';
import type { ToolEffect } from '../../../lib/toolAnnotations';
import { EffectBadge } from '../EffectBadge';

/**
 * What a workflow's effect promises: muster marks its `workflow_<name>` tool
 * read-only only when every tool its steps can reach is.
 */
export const WORKFLOW_EFFECT_HINTS: Record<ToolEffect, string> = {
  reads: 'Every step only reads.',
  changes: 'At least one step can change things.',
};

export type WorkflowEffectBadgeProps = {
  effect: ToolEffect;
};

/**
 * A workflow's derived effect: the tool's badge ("Reads" / "Changes
 * things"), with what that means for its steps in a `HintTooltip`: on hover,
 * keyboard focus or a tap, read by a screen reader as the badge's
 * description, and kept off the row it sits in.
 */
export function WorkflowEffectBadge({ effect }: WorkflowEffectBadgeProps) {
  return (
    <HintTooltip hint={WORKFLOW_EFFECT_HINTS[effect]}>
      <EffectBadge effect={effect} />
    </HintTooltip>
  );
}
