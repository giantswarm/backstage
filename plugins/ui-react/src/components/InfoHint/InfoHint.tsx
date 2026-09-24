import { ReactNode } from 'react';
import classNames from 'classnames';
import { makeStyles } from '@material-ui/core';
import InfoOutlinedIcon from '@material-ui/icons/InfoOutlined';
import { ButtonIcon, Tooltip, TooltipTrigger } from '@backstage/ui';

const SIZES = {
  // Shrunk to a 0.7rem label's own height, so a hinted label lines up with an
  // unhinted one — a default `ButtonIcon` is taller and pushes content down.
  small: { button: 16, icon: 13 },
  // Beside body text: a table cell's status, a metadata value.
  medium: { button: 20, icon: 16 },
} as const;

const useStyles = makeStyles({
  button: ({ size }: { size: keyof typeof SIZES }) => ({
    width: SIZES[size].button,
    height: SIZES[size].button,
    minWidth: SIZES[size].button,
    padding: 0,
    color: 'inherit',
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
});

export interface InfoHintProps {
  /**
   * The button's accessible name: what pressing it reveals, e.g. "How Tokens
   * per second is calculated". Beside text already on screen, "Info" says
   * nothing.
   */
  label: string;
  /** The explanation, shown in the tooltip. */
  children: ReactNode;
  /** `small` beside a small uppercase label, `medium` beside body text. */
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * An info icon that explains the thing next to it in a tooltip.
 *
 * A focusable button rather than a `title` on the text, for two reasons: bui's
 * `TooltipTrigger` wraps react-aria's, which only wires up its own focusable
 * components — a bare `<span>` gets nothing — and a hint reachable only by
 * hovering inert text is invisible to the keyboard and to anyone who does not
 * think to hover it.
 */
export function InfoHint({
  label,
  children,
  size = 'small',
  className,
}: InfoHintProps) {
  const classes = useStyles({ size });
  return (
    <TooltipTrigger delay={200}>
      <ButtonIcon
        className={classNames(classes.button, className)}
        variant="tertiary"
        size="small"
        aria-label={label}
        icon={<InfoOutlinedIcon className={classes.icon} />}
      />
      <Tooltip className={classes.tooltip}>{children}</Tooltip>
    </TooltipTrigger>
  );
}
