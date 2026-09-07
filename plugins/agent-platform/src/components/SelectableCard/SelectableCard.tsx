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
  // Same shell as `card`, minus the affordances: nothing to click, so no pointer
  // cursor and no hover feedback. Kept next to `card` so the two stay visually
  // identical as that one evolves.
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

// The compact sibling of the card: one row per option, for lists that run to
// dozens or hundreds of entries (a server's tools, a catalogue of workflows).
// Same indicator, same selection semantics, a fraction of the height — the
// description is one truncated line with the full text on hover.
const useRowStyles = makeStyles(theme => ({
  list: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    overflow: 'hidden',
    background: theme.palette.background.paper,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
    width: '100%',
    textAlign: 'left',
    cursor: 'pointer',
    padding: theme.spacing(0.75, 1.5),
    border: 0,
    background: 'transparent',
    color: theme.palette.text.primary,
    font: 'inherit',
    '&:not(:last-child)': {
      borderBottom: `1px solid ${theme.palette.divider}`,
    },
    '&:hover': {
      background: theme.palette.action.hover,
    },
    '&:focus-visible': {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: -2,
    },
  },
  rowSelected: {
    background: theme.palette.action.selected,
  },
  rowMain: {
    display: 'inline-flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
    maxWidth: '100%',
  },
  rowTitle: {
    fontWeight: 600,
    fontSize: 13,
  },
  rowTitleCode: {
    fontFamily: 'monospace',
  },
  rowSummary: {
    flex: '1 1 220px',
    minWidth: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    color: theme.palette.text.secondary,
    fontSize: 12,
  },
}));

type SelectableRowListProps = {
  /** `group` for multi-select, `radiogroup` for single-select. */
  role: 'radiogroup' | 'group';
  ariaLabel: string;
  children: ReactNode;
};

/** A bordered stack of {@link SelectableRow}s. */
export function SelectableRowList({
  role,
  ariaLabel,
  children,
}: SelectableRowListProps) {
  const classes = useRowStyles();
  return (
    <div className={classes.list} role={role} aria-label={ariaLabel}>
      {children}
    </div>
  );
}

type SelectableRowProps = {
  role: 'radio' | 'checkbox';
  selected: boolean;
  ariaLabel: string;
  onSelect: () => void;
  /** The option's name. */
  title: ReactNode;
  /** Set the title in monospace — a tool or selector name. */
  code?: boolean;
  /** Markers and other short badges next to the title. */
  meta?: ReactNode;
  /** One line, truncated; the full text is the row's tooltip. */
  summary?: string;
};

/** A full-width selectable row with the same indicator as {@link SelectableCard}. */
export function SelectableRow({
  role,
  selected,
  ariaLabel,
  onSelect,
  title,
  code = false,
  meta,
  summary,
}: SelectableRowProps) {
  const cardClasses = useStyles();
  const classes = useRowStyles();
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
      title={summary}
      onClick={onSelect}
      className={`${classes.row} ${selected ? classes.rowSelected : ''}`}
    >
      <Indicator
        fontSize="small"
        aria-hidden
        className={`${cardClasses.indicator} ${
          selected
            ? cardClasses.indicatorSelected
            : cardClasses.indicatorUnselected
        }`}
      />
      <span className={classes.rowMain}>
        <span
          className={`${classes.rowTitle} ${code ? classes.rowTitleCode : ''}`}
        >
          {title}
        </span>
        {meta}
      </span>
      {summary && <span className={classes.rowSummary}>{summary}</span>}
    </button>
  );
}
