import { useEffect, useId, useRef, useState } from 'react';
import { Tooltip, TooltipTrigger, VisuallyHidden } from '@backstage/ui';
import { makeStyles } from '@material-ui/core/styles';
import { stopRowPress } from '@giantswarm/backstage-plugin-ui-react';
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

const useStyles = makeStyles({
  wrapper: {
    display: 'inline-flex',
    borderRadius: 4,
    cursor: 'default',
    '&:focus-visible': {
      outline: '2px solid var(--bui-ring, #009fff)',
      outlineOffset: 2,
    },
  },
  tooltip: {
    maxWidth: 280,
  },
});

export type WorkflowEffectBadgeProps = {
  effect: ToolEffect;
};

/**
 * A workflow's derived effect: the tool's badge ("Reads" / "Changes
 * things"), with what that means for its steps in a tooltip. Hover, keyboard
 * focus and a tap all show it — a phone has no hover — and Escape or a press
 * elsewhere closes it; a screen reader hears it as the badge's description.
 *
 * The badge sits in a focusable wrapper that opens a controlled bui tooltip
 * anchored on it, as `DisabledAction` does: bui's `TooltipTrigger` only wires
 * up react-aria's own focusable components, and react-aria never opens a
 * tooltip on a tap. A press on it stays off the row it sits in, so a table or
 * list row does not open the workflow instead.
 */
export function WorkflowEffectBadge({ effect }: WorkflowEffectBadgeProps) {
  const classes = useStyles();
  const wrapper = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const hintId = useId();
  const hint = WORKFLOW_EFFECT_HINTS[effect];

  // Opened by a tap, the hint stays until a press elsewhere: no mouseleave
  // or blur reliably follows a tap on a touch screen.
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const closeOutside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  return (
    <TooltipTrigger isOpen={open} onOpenChange={setOpen}>
      {/* Focusable on purpose, the keyboard's way to the hint; it explains
          the badge rather than acting, hence no role. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <span
        ref={wrapper}
        className={classes.wrapper}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        aria-describedby={hintId}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onPointerDown={stopRowPress}
        onPointerUp={stopRowPress}
        // Opens, never toggles: a tap also fires the emulated mouseenter
        // and the focus first, which have opened it already.
        onClick={event => {
          stopRowPress(event);
          setOpen(true);
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            setOpen(false);
          }
          // Enter or Space on the badge must not open the row it sits in.
          if (event.key === 'Enter' || event.key === ' ') {
            stopRowPress(event);
          }
        }}
      >
        <EffectBadge effect={effect} />
      </span>
      <VisuallyHidden id={hintId}>{hint}</VisuallyHidden>
      <Tooltip triggerRef={wrapper} className={classes.tooltip}>
        {hint}
      </Tooltip>
    </TooltipTrigger>
  );
}
