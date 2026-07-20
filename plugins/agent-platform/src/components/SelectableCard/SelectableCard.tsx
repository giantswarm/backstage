import { ReactNode } from 'react';
import { Flex } from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import RadioButtonUncheckedIcon from '@material-ui/icons/RadioButtonUnchecked';
import CheckBoxIcon from '@material-ui/icons/CheckBox';
import CheckBoxOutlineBlankIcon from '@material-ui/icons/CheckBoxOutlineBlank';

// Shared styling + markup for the selectable option cards used by the model and
// skill pickers. bui's Card button variant renders a collapsed 1px overlay
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
  code: {
    fontFamily: 'monospace',
  },
}));

/** Shared styles for card content; exposes the monospace `code` class. */
export const useSelectableCardStyles = useStyles;

type SelectableCardGridProps = {
  /** `radiogroup` for single-select, `group` for multi-select. */
  role: 'radiogroup' | 'group';
  ariaLabel: string;
  /** Minimum card width for the auto-fill grid. */
  minWidth?: number;
  children: ReactNode;
};

/** Responsive auto-fill grid of selectable cards. */
export function SelectableCardGrid({
  role,
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
      role={role}
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}

type SelectableCardProps = {
  /** `radio` (single-select) picks the check-circle icon; `checkbox` the box. */
  role: 'radio' | 'checkbox';
  selected: boolean;
  ariaLabel: string;
  onSelect: () => void;
  children: ReactNode;
};

/** A full-area selectable card with a selection indicator icon. */
export function SelectableCard({
  role,
  selected,
  ariaLabel,
  onSelect,
  children,
}: SelectableCardProps) {
  const classes = useStyles();
  const SelectedIcon = role === 'radio' ? CheckCircleIcon : CheckBoxIcon;
  const UnselectedIcon =
    role === 'radio' ? RadioButtonUncheckedIcon : CheckBoxOutlineBlankIcon;
  const Indicator = selected ? SelectedIcon : UnselectedIcon;

  return (
    <button
      type="button"
      role={role}
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
