import { ReactNode } from 'react';
import { Flex } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import RadioButtonUncheckedIcon from '@material-ui/icons/RadioButtonUnchecked';

// The single-select option cards of the MCP server registration wizard
// (transport, auth mode). A trimmed copy of agent-platform's SelectableCard —
// same markup and styling, radio role only — so the two creation flows look
// like one system. bui's Card button variant renders a collapsed 1px overlay
// trigger in this version, so we roll a real full-area <button>.
const useStyles = makeStyles(theme => ({
  grid: {
    display: 'grid',
    gap: theme.spacing(1.5),
  },
  card: {
    // Flex column so content stays pinned to the top when the grid stretches
    // cards to equal row height (native buttons otherwise center content).
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    textAlign: 'left',
    cursor: 'pointer',
    padding: theme.spacing(1.5),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    background: theme.palette.background.paper,
    color: theme.palette.text.primary,
    font: 'inherit',
    '&:hover': {
      borderColor: theme.palette.text.secondary,
    },
    '&:focus-visible': {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: 1,
    },
  },
  selected: {
    borderColor: theme.palette.primary.main,
    outline: `1px solid ${theme.palette.primary.main}`,
  },
  indicator: {
    flexShrink: 0,
  },
  indicatorUnselected: {
    color: theme.palette.text.secondary,
    opacity: 0.5,
  },
  indicatorSelected: {
    color: theme.palette.primary.main,
  },
}));

type SelectableCardGridProps = {
  ariaLabel: string;
  /** Minimum card width for the auto-fill grid. */
  minWidth?: number;
  children: ReactNode;
};

/** Responsive auto-fill grid of single-select cards. */
export function SelectableCardGrid({
  ariaLabel,
  minWidth = 220,
  children,
}: SelectableCardGridProps) {
  const classes = useStyles();
  return (
    <div
      className={classes.grid}
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`,
      }}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}

type SelectableCardProps = {
  selected: boolean;
  ariaLabel: string;
  onSelect: () => void;
  children: ReactNode;
};

/** A full-area single-select card with a radio indicator icon. */
export function SelectableCard({
  selected,
  ariaLabel,
  onSelect,
  children,
}: SelectableCardProps) {
  const classes = useStyles();
  const Indicator = selected ? CheckCircleIcon : RadioButtonUncheckedIcon;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={ariaLabel}
      onClick={onSelect}
      className={`${classes.card} ${selected ? classes.selected : ''}`}
    >
      <Flex align="start" justify="between" gap="2">
        <Flex direction="column" gap="1">
          {children}
        </Flex>
        <Indicator
          fontSize="small"
          aria-hidden
          className={`${classes.indicator} ${
            selected ? classes.indicatorSelected : classes.indicatorUnselected
          }`}
        />
      </Flex>
    </button>
  );
}
