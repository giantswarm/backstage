import { ReactNode, useState } from 'react';
import { Collapse, makeStyles } from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';

const ANIMATION_DURATION = 200;

const useStyles = makeStyles(theme => ({
  root: {
    width: '100%',
  },
  trigger: {
    display: 'flex',
    width: '100%',
    gap: theme.spacing(0.75),
    alignItems: 'flex-start',
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    cursor: 'pointer',
    transition: theme.transitions.create('color'),
    color: theme.palette.text.primary,
    border: 'none',
    background: 'none',
    padding: theme.spacing(0.5, 0),
    textAlign: 'left',
    fontFamily: 'inherit',
    '&:hover': {
      color: theme.palette.text.secondary,
    },
    '&:focus-visible': {
      outline: `2px solid ${theme.palette.primary.main}`,
      outlineOffset: 2,
      borderRadius: 'var(--bui-radius-1)',
    },
  },
  chevron: {
    width: 16,
    height: 16,
    flexShrink: 0,
    marginTop: 2,
    color: theme.palette.text.secondary,
    transition: theme.transitions.create('transform', {
      duration: ANIMATION_DURATION,
      easing: theme.transitions.easing.easeOut,
    }),
  },
  chevronClosed: {
    transform: 'rotate(-90deg)',
  },
  // The same row anatomy without a disclosure: aligns rows that cannot expand
  // with the ones that can.
  inertRoot: {
    display: 'flex',
    width: '100%',
    gap: theme.spacing(0.75),
    alignItems: 'flex-start',
    fontSize: '0.8125rem',
    lineHeight: 1.5,
    padding: theme.spacing(0.5, 0),
  },
  // Keeps an inert row's text aligned with its expandable neighbours' — the
  // space the chevron would occupy.
  chevronSpacer: {
    width: 16,
    flexShrink: 0,
  },
  panelCard: {
    overflow: 'hidden',
    fontSize: '0.8125rem',
    borderRadius: 'var(--bui-radius-2)',
    border: `1px solid ${theme.palette.divider}`,
    padding: theme.spacing(1.5),
    backgroundColor: 'var(--bui-bg-neutral-1)',
    marginTop: theme.spacing(0.5),
    marginBottom: theme.spacing(0.5),
  },
  panelPlain: {
    paddingTop: theme.spacing(0.5),
    paddingBottom: theme.spacing(0.5),
  },
}));

export type ActivityRowProps = {
  /** Stable id, used to tie the trigger to its panel for assistive tech. */
  id: string;
  /** The row itself: status icon, name, badges, summary. */
  trigger: ReactNode;
  /** What expanding reveals. */
  children: ReactNode;
  /**
   * `card` frames payloads on their own surface; `plain` leaves prose —
   * reasoning — unframed, since a box around thoughts reads as a payload.
   */
  variant?: 'card' | 'plain';
  /** Applies on mount; the list remounts entries when the global toggle changes. */
  defaultExpanded?: boolean;
};

/**
 * One line of the agent's internal work, expandable to its detail.
 *
 * A plain disclosure rather than bui's Accordion: these rows sit between prose
 * messages, so they need to read as quiet single lines — a chevron and a
 * summary — not as form sections.
 */
export function ActivityRow({
  id,
  trigger,
  children,
  variant = 'card',
  defaultExpanded = false,
}: ActivityRowProps) {
  const classes = useStyles();
  const [isOpen, setOpen] = useState(defaultExpanded);
  const panelId = `activity-panel-${id}`;

  return (
    <div className={classes.root}>
      <button
        type="button"
        className={classes.trigger}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setOpen(open => !open)}
      >
        <ExpandMoreIcon
          className={`${classes.chevron} ${isOpen ? '' : classes.chevronClosed}`}
        />
        {trigger}
      </button>
      <Collapse in={isOpen} timeout={ANIMATION_DURATION}>
        <div
          id={panelId}
          role="group"
          className={variant === 'card' ? classes.panelCard : classes.panelPlain}
        >
          {children}
        </div>
      </Collapse>
    </div>
  );
}

/** The same row anatomy for an entry with nothing to expand. */
export function InertActivityRow({ children }: { children: ReactNode }) {
  const classes = useStyles();
  return (
    <div className={classes.inertRoot}>
      <span className={classes.chevronSpacer} aria-hidden />
      {children}
    </div>
  );
}
