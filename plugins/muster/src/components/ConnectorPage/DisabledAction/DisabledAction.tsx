import { ReactNode, useId, useRef, useState } from 'react';
import { Tooltip, TooltipTrigger, VisuallyHidden } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles({
  wrapper: {
    display: 'inline-flex',
    borderRadius: 8,
    '&:focus-visible': {
      outline: '2px solid var(--bui-ring, #009fff)',
      outlineOffset: 2,
    },
    // A disabled control receives no pointer events in every browser, so the
    // wrapper must be what the pointer is over for the hover to register.
    '& > *': {
      pointerEvents: 'none',
    },
  },
  tooltip: {
    maxWidth: 280,
  },
});

export interface DisabledActionProps {
  /** Why the action is unavailable: the tooltip, and its accessible description. */
  reason: string;
  /**
   * The disabled control, given the id of the element describing it so a
   * screen reader announces the reason with the control itself.
   */
  children: (describedBy: string) => ReactNode;
}

/**
 * A disabled header action that still says why it is disabled, on hover and
 * on keyboard focus.
 *
 * bui's `TooltipTrigger` cannot do this on its own: react-aria withholds a
 * trigger's hover and focus handlers from a disabled button (and a disabled
 * button is not focusable at all), so the tooltip would never open. The
 * control sits in a focusable wrapper instead, and the bui `Tooltip` is
 * anchored on the wrapper and opened by it. It stays inside a (controlled)
 * `TooltipTrigger`: react-aria's tooltip reads its open state from the
 * trigger's context and fails without one.
 */
export function DisabledAction({ reason, children }: DisabledActionProps) {
  const classes = useStyles();
  const wrapper = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const descriptionId = useId();
  return (
    // Controlled: the wrapper opens and closes it. The trigger only provides
    // the open state the tooltip reads from context; the tooltip is anchored
    // on the wrapper through its own `triggerRef`, which wins over the
    // trigger's.
    <TooltipTrigger isOpen={open} onOpenChange={setOpen}>
      {/* The wrapper is focusable on purpose: it is the keyboard's only way
          to the reason, since the disabled control inside takes no focus.
          It describes that control rather than acting, hence no role. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <span
        ref={wrapper}
        className={classes.wrapper}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        aria-describedby={descriptionId}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      >
        {children(descriptionId)}
      </span>
      <VisuallyHidden id={descriptionId}>{reason}</VisuallyHidden>
      <Tooltip triggerRef={wrapper} className={classes.tooltip}>
        {reason}
      </Tooltip>
    </TooltipTrigger>
  );
}
