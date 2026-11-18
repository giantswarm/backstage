import {
  ReactNode,
  RefObject,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { Tooltip, TooltipTrigger, VisuallyHidden } from '@backstage/ui';
import classNames from 'classnames';
import { makeStyles } from '@material-ui/core';
// Must be the same module instance as the one @backstage/ui's TooltipTrigger
// provides the context from, so this package pins react-aria-components to
// bui's range (see renovate-custom.json5). A second copy leaves `state`
// undefined and the hint never opens.
import { TooltipTriggerStateContext } from 'react-aria-components';
import { stopRowPress } from '../../utils/rowPress';

const useStyles = makeStyles({
  trigger: {
    display: 'inline-flex',
    borderRadius: 4,
    cursor: 'default',
    '&:focus-visible': {
      outline: '2px solid var(--bui-ring, #009fff)',
      outlineOffset: 2,
    },
  },
  // On an element inside the tooltip: bui's `Tooltip` drops a `className`.
  hint: {
    whiteSpace: 'pre-line',
    overflowWrap: 'anywhere',
  },
});

export interface HintTooltipProps {
  /** What the tooltip shows. */
  hint: ReactNode;
  /**
   * What a screen reader hears as the trigger's description. Without it, the
   * hint when it is text and there is no `label` (which the hint would
   * repeat).
   */
  description?: string;
  /**
   * The trigger's accessible name, as an image, for content that has no name
   * of its own (a logo). Its content is then hidden from assistive
   * technology. Without it the content names itself (a badge's text).
   */
  label?: string;
  /** The content the hint explains. */
  children: ReactNode;
  className?: string;
}

/**
 * A hint on something that is not a control: a badge, a logo. Hover,
 * keyboard focus and a tap open it — a phone has no hover — and Escape or a
 * press elsewhere closes it. Opening one closes any other open tooltip, as
 * bui's do. A screen reader hears the hint as the trigger's description.
 *
 * The content sits in a focusable wrapper that opens a controlled bui
 * tooltip anchored on it: bui's `TooltipTrigger` only wires up react-aria's
 * own focusable components, and react-aria never opens a tooltip on a tap. A
 * press on it, by pointer or by Enter or Space, stays off the row it sits
 * in, so a table or list row does not open instead.
 */
export function HintTooltip({
  hint,
  description,
  label,
  children,
  className,
}: HintTooltipProps) {
  const classes = useStyles();
  const trigger = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const descriptionId = useId();
  // With a label the hint usually repeats it: only an explicit description.
  const described =
    description ??
    (label === undefined && typeof hint === 'string' ? hint : undefined);

  // Opened by a tap, the hint stays until a press elsewhere: no mouseleave
  // or blur reliably follows a tap on a touch screen.
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const closeOutside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  return (
    <TooltipTrigger isOpen={open} onOpenChange={setOpen}>
      <HintTrigger
        triggerRef={trigger}
        className={classNames(classes.trigger, className)}
        label={label}
        describedBy={described ? descriptionId : undefined}
      >
        {children}
      </HintTrigger>
      {described && (
        <VisuallyHidden id={descriptionId}>{described}</VisuallyHidden>
      )}
      <Tooltip triggerRef={trigger}>
        <span className={classes.hint}>{hint}</span>
      </Tooltip>
    </TooltipTrigger>
  );
}

/**
 * Opens and closes through the trigger's react-aria state rather than the
 * `open` state directly, so opening one closes any other open tooltip.
 */
function HintTrigger({
  triggerRef,
  className,
  label,
  describedBy,
  children,
}: {
  triggerRef: RefObject<HTMLSpanElement>;
  className: string;
  label?: string;
  describedBy?: string;
  children: ReactNode;
}) {
  const state = useContext(TooltipTriggerStateContext);
  const show = () => state?.open(true);
  const hide = () => state?.close(true);

  return (
    // Focusable on purpose, the keyboard's way to the hint. It explains
    // rather than acts: an image when it names its content, else no role.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <span
      ref={triggerRef}
      className={className}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      {...(label ? { role: 'img', 'aria-label': label } : {})}
      aria-describedby={describedBy}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onPointerDown={stopRowPress}
      onPointerUp={stopRowPress}
      // Opens, never toggles: a tap also fires the emulated mouseenter and
      // the focus first, which have opened it already.
      onClick={event => {
        stopRowPress(event);
        show();
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          hide();
        }
        // Enter or Space on the hint must not open the row it sits in.
        if (event.key === 'Enter' || event.key === ' ') {
          stopRowPress(event);
        }
      }}
    >
      {children}
    </span>
  );
}
