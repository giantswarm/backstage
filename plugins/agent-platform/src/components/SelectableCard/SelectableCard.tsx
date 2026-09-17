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
  // The card's frame. A shell around the button rather than the button itself,
  // so a card can carry a control of its own -- a nested <button> would be
  // invalid markup, and role="checkbox" makes its children presentational,
  // hiding one from assistive tech.
  shell: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    background: theme.palette.background.paper,
    color: theme.palette.text.primary,
    '&:hover': {
      borderColor: theme.palette.text.secondary,
    },
  },
  card: {
    // Flex column so content stays pinned to the top when the grid stretches
    // cards to equal row height (native buttons otherwise center content).
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    width: '100%',
    textAlign: 'left',
    cursor: 'pointer',
    padding: theme.spacing(1.5),
    border: 0,
    borderRadius: 'inherit',
    background: 'none',
    color: 'inherit',
    font: 'inherit',
    // Drawn inside the shell, which now owns the border the ring used to sit on.
    '&:focus-visible': {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: -2,
    },
  },
  // Out of the card's flow, so a card with a control is exactly as tall as one
  // without, and faded out until the pointer is on the card or the control
  // itself has focus -- an affordance for the card you are reading, not a row of
  // buttons down the grid. It stays clickable while invisible, which costs
  // nothing: a pointer can't reach it without hovering the card first.
  hoverAction: {
    position: 'absolute',
    right: theme.spacing(0.5),
    bottom: theme.spacing(0.5),
    borderRadius: theme.shape.borderRadius,
    background: theme.palette.background.paper,
    opacity: 0,
    transition: theme.transitions.create('opacity', {
      duration: theme.transitions.duration.shortest,
    }),
    '$shell:hover &': {
      opacity: 1,
    },
    '&:focus-within': {
      opacity: 1,
    },
  },
  // The same frame as `shell`, minus the affordances: nothing to click, so no
  // pointer cursor and no hover feedback. Kept next to it so the two stay
  // visually identical as that one evolves.
  cardStatic: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    textAlign: 'left',
    padding: theme.spacing(1.5),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    background: theme.palette.background.paper,
    color: theme.palette.text.primary,
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
  /**
   * `radiogroup` for single-select, `group` for multi-select, `list` for a
   * read-only grid of {@link StaticCard}s.
   */
  role: 'radiogroup' | 'group' | 'list';
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
  /**
   * A control of the card's own -- a *Show more* toggle, say -- shown in the
   * bottom-right corner while the pointer is on the card or it has focus.
   * Anything interactive belongs here rather than in `children`.
   */
  hoverAction?: ReactNode;
  children: ReactNode;
};

/**
 * The same card, read-only: no selection indicator, no press affordance.
 *
 * For displaying the things the pickers select — an agent's mounted skills, say —
 * so the two surfaces look like one system. Deliberately a `<div>` with `role`
 * `listitem` rather than a `SelectableCard` with the indicator hidden: a
 * `role="checkbox"` button that does nothing is announced as an operable control
 * and invites a click that has no effect.
 */
export function StaticCard({ children }: { children: ReactNode }) {
  const classes = useStyles();

  return (
    <div role="listitem" className={classes.cardStatic}>
      <Flex direction="column" gap="1">
        {children}
      </Flex>
    </div>
  );
}

/** A full-area selectable card with a selection indicator icon. */
export function SelectableCard({
  role,
  selected,
  ariaLabel,
  onSelect,
  hoverAction,
  children,
}: SelectableCardProps) {
  const classes = useStyles();
  const SelectedIcon = role === 'radio' ? CheckCircleIcon : CheckBoxIcon;
  const UnselectedIcon =
    role === 'radio' ? RadioButtonUncheckedIcon : CheckBoxOutlineBlankIcon;
  const Indicator = selected ? SelectedIcon : UnselectedIcon;

  return (
    <div className={`${classes.shell} ${selected ? classes.selected : ''}`}>
      <button
        type="button"
        role={role}
        aria-checked={selected}
        aria-label={ariaLabel}
        onClick={onSelect}
        className={classes.card}
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
      {hoverAction && <div className={classes.hoverAction}>{hoverAction}</div>}
    </div>
  );
}
