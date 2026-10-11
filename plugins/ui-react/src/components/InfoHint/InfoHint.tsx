import { ReactNode, useRef, useState } from 'react';
import classNames from 'classnames';
import { makeStyles } from '@material-ui/core';
import InfoOutlinedIcon from '@material-ui/icons/InfoOutlined';
import {
  ButtonIcon,
  Popover,
  Text,
  Tooltip,
  TooltipTrigger,
} from '@backstage/ui';
import {
  PHONE_QUERY,
  TOUCH_QUERY,
  useTouchInput,
} from '../../utils/breakpoints';
import { stopRowPress } from '../../utils/rowPress';

const SIZES = {
  // Shrunk to a 0.7rem label's own height, so a hinted label lines up with an
  // unhinted one — a default `ButtonIcon` is taller and pushes content down.
  small: { button: 16, icon: 13 },
  // Beside body text: a table cell's status, a metadata value.
  medium: { button: 20, icon: 16 },
} as const;

/**
 * The hit area around the icon, in px: WCAG 2.5.8's 24 with a mouse, 44 for a
 * thumb. The icon keeps its size so a hinted label still lines up; the area
 * around it is an invisible `::before`.
 */
const HIT_AREA = { pointer: 24, touch: 44 } as const;

const hitArea = (px: number) => ({
  // Centred on the icon, never smaller than it: `50% - px/2` on each side is
  // negative (an outset) while the target is wider than the icon.
  inset: `min(0px, calc(50% - ${px / 2}px))`,
});

const useStyles = makeStyles({
  button: ({ size }: { size: keyof typeof SIZES }) => ({
    width: SIZES[size].button,
    height: SIZES[size].button,
    minWidth: SIZES[size].button,
    padding: 0,
    color: 'inherit',
    '&::before': {
      content: '""',
      position: 'absolute',
      ...hitArea(HIT_AREA.pointer),
    },
    [`@media ${PHONE_QUERY}, ${TOUCH_QUERY}`]: {
      '&::before': hitArea(HIT_AREA.touch),
    },
  }),
  icon: ({ size }: { size: keyof typeof SIZES }) => ({
    fontSize: SIZES[size].icon,
  }),
  /** Long enough for a sentence, narrow enough to stay readable. */
  tooltip: {
    maxWidth: 280,
    // Multi-line hints (a reason plus warnings) keep their line breaks.
    whiteSpace: 'pre-line',
  },
  // The same measure as the tooltip, and never wider than a phone allows.
  popoverContent: {
    display: 'block',
    maxWidth: 'min(280px, calc(100vw - 48px))',
    whiteSpace: 'pre-line',
    overflowWrap: 'anywhere',
  },
});

export interface InfoHintProps {
  /**
   * The button's accessible name: what pressing it reveals, e.g. "How Tokens
   * per second is calculated". Beside text already on screen, "Info" says
   * nothing. Also names the popover the press opens.
   */
  label: string;
  /** The explanation, shown in the tooltip and in the popover. */
  children: ReactNode;
  /** `small` beside a small uppercase label, `medium` beside body text. */
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * An info icon that explains the thing next to it.
 *
 * - **Press** (tap, click, Enter or Space) opens the explanation in a popover
 *   — a dialog named by `label`, closed by Escape, a press outside it or
 *   pressing the icon again — and focus returns to the icon. This is the only
 *   way in on a touch screen, where nothing is ever hovered.
 * - **Hover** with a mouse, or **keyboard focus**, shows the same text as a
 *   tooltip, as before. Not on touch input, where a tooltip cannot be reached
 *   and a press already opens the popover.
 *
 * A focusable button rather than a `title` on the text, for two reasons: bui's
 * `TooltipTrigger` wraps react-aria's, which only wires up its own focusable
 * components — a bare `<span>` gets nothing — and a hint reachable only by
 * hovering inert text is invisible to the keyboard, to touch, and to anyone
 * who does not think to hover it.
 *
 * The icon stays small to line up with the label beside it; its hit area is
 * 24px, 44px at phone width or on touch input.
 */
export function InfoHint({
  label,
  children,
  size = 'small',
  className,
}: InfoHintProps) {
  const classes = useStyles({ size });
  const isTouch = useTouchInput();
  const [isOpen, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <TooltipTrigger delay={200} isDisabled={isTouch || isOpen}>
        <ButtonIcon
          ref={triggerRef}
          className={classNames(classes.button, className)}
          variant="tertiary"
          size="small"
          aria-label={label}
          aria-expanded={isOpen}
          onPress={() => setOpen(open => !open)}
          icon={<InfoOutlinedIcon className={classes.icon} />}
        />
        <Tooltip className={classes.tooltip}>{children}</Tooltip>
      </TooltipTrigger>
      <Popover
        triggerRef={triggerRef}
        isOpen={isOpen}
        onOpenChange={setOpen}
        aria-label={label}
        placement="top"
      >
        {/* The popover renders in a portal, but React still bubbles a click
            in it to the hint's ancestors: a hand-rolled clickable row would
            open its item on a tap meant for the explanation. */}
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
        <div onClick={stopRowPress}>
          <Text
            as="span"
            variant="body-small"
            className={classes.popoverContent}
          >
            {children}
          </Text>
        </div>
      </Popover>
    </>
  );
}
